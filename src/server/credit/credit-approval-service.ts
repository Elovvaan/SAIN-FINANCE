import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

export type CreditOperator = { institutionKey: string; userId: string };

const decisionTypes = new Set(["APPROVE", "CONDITIONAL_APPROVAL", "DECLINE", "RETURN_FOR_INFORMATION"]);
const authorityLevels = new Set(["LOAN_OFFICER", "MANAGER", "SENIOR_MANAGER", "COMMITTEE"]);

function requiredAuthority(amount: number, riskScore: number | null) {
  if (amount >= 1000000 || (riskScore !== null && riskScore >= 700)) return "COMMITTEE";
  if (amount >= 250000 || (riskScore !== null && riskScore >= 500)) return "SENIOR_MANAGER";
  if (amount >= 50000 || (riskScore !== null && riskScore >= 300)) return "MANAGER";
  return "LOAN_OFFICER";
}

export async function listCreditDecisionQueue(operator: CreditOperator, query = "") {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const result = await client.query(
      `SELECT d.credit_decision_id, d.underwriting_case_id, d.loan_package_id, d.status,
              d.decision_type, d.requested_amount, d.approved_amount, d.currency_code,
              d.authority_level, d.committee_required, d.exception_requested,
              d.exception_reason, d.final_conditions, d.decided_at, d.updated_at,
              l.package_number, l.loan_type, p.display_name AS customer_name,
              u.risk_score, u.recommendation,
              COALESCE(a.approval_count, 0)::int AS approval_count
       FROM credit_decisions d
       JOIN underwriting_cases u ON u.institution_key=d.institution_key AND u.underwriting_case_id=d.underwriting_case_id
       JOIN loan_packages l ON l.institution_key=d.institution_key AND l.loan_package_id=d.loan_package_id
       JOIN customer_profiles p ON p.institution_key=l.institution_key AND p.customer_id=l.primary_customer_id
       LEFT JOIN (
         SELECT institution_key, credit_decision_id, COUNT(*) AS approval_count
         FROM credit_approvals GROUP BY institution_key, credit_decision_id
       ) a ON a.institution_key=d.institution_key AND a.credit_decision_id=d.credit_decision_id
       WHERE d.institution_key=$1
         AND ($2='' OR to_tsvector('english', coalesce(l.package_number,'') || ' ' || coalesce(p.display_name,'') || ' ' || coalesce(l.loan_type,'')) @@ plainto_tsquery('english',$2))
       ORDER BY CASE d.status WHEN 'IN_REVIEW' THEN 1 WHEN 'PENDING' THEN 2 ELSE 3 END, d.updated_at DESC
       LIMIT 250`,
      [operator.institutionKey, query.trim()],
    );
    return result.rows;
  });
}

export async function listEligibleRecommendations(operator: CreditOperator) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const result = await client.query(
      `SELECT u.underwriting_case_id, u.loan_package_id, u.risk_score, u.recommendation,
              l.package_number, l.loan_type, l.requested_amount, l.currency_code,
              p.display_name AS customer_name
       FROM underwriting_cases u
       JOIN loan_packages l ON l.institution_key=u.institution_key AND l.loan_package_id=u.loan_package_id
       JOIN customer_profiles p ON p.institution_key=l.institution_key AND p.customer_id=l.primary_customer_id
       LEFT JOIN credit_decisions d ON d.institution_key=u.institution_key AND d.underwriting_case_id=u.underwriting_case_id
       WHERE u.institution_key=$1 AND d.credit_decision_id IS NULL
         AND u.status IN ('RECOMMENDED_APPROVAL','RECOMMENDED_DECLINE','CONDITIONAL')
       ORDER BY u.updated_at DESC LIMIT 500`,
      [operator.institutionKey],
    );
    return result.rows;
  });
}

export async function createCreditDecision(input: { operator: CreditOperator; underwritingCaseId: string }) {
  if (!input.underwritingCaseId) throw new Error("CREDIT_UNDERWRITING_CASE_REQUIRED");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const found = await client.query<{ loan_package_id: string; risk_score: string | null; recommendation: string | null; requested_amount: string; currency_code: string }>(
      `SELECT u.loan_package_id, u.risk_score::text, u.recommendation,
              l.requested_amount::text, l.currency_code
       FROM underwriting_cases u
       JOIN loan_packages l ON l.institution_key=u.institution_key AND l.loan_package_id=u.loan_package_id
       WHERE u.institution_key=$1 AND u.underwriting_case_id=$2
         AND u.status IN ('RECOMMENDED_APPROVAL','RECOMMENDED_DECLINE','CONDITIONAL') LIMIT 1`,
      [input.operator.institutionKey, input.underwritingCaseId],
    );
    const current = found.rows[0];
    if (!current) throw new Error("CREDIT_RECOMMENDATION_NOT_FOUND");
    const existing = await client.query(`SELECT credit_decision_id FROM credit_decisions WHERE institution_key=$1 AND underwriting_case_id=$2 LIMIT 1`, [input.operator.institutionKey, input.underwritingCaseId]);
    if (existing.rows[0]) throw new Error("CREDIT_DECISION_EXISTS");
    const amount = Number(current.requested_amount);
    const risk = current.risk_score === null ? null : Number(current.risk_score);
    const authority = requiredAuthority(amount, risk);
    const decisionId = randomUUID();
    await client.query(
      `INSERT INTO credit_decisions (
         credit_decision_id,institution_key,underwriting_case_id,loan_package_id,status,
         requested_amount,currency_code,authority_level,committee_required,created_by,updated_by
       ) VALUES ($1,$2,$3,$4,'PENDING',$5,$6,$7,$8,$9,$9)`,
      [decisionId, input.operator.institutionKey, input.underwritingCaseId, current.loan_package_id, amount, current.currency_code, authority, authority === "COMMITTEE", input.operator.userId],
    );
    await recordEvent(client, input.operator, decisionId, input.underwritingCaseId, current.loan_package_id, null, "PENDING", "DECISION_CREATED", { authority, underwritingRecommendation: current.recommendation });
    return { creditDecisionId: decisionId, status: "PENDING", authorityLevel: authority };
  });
}

export async function updateCreditDecision(input: {
  operator: CreditOperator;
  creditDecisionId: string;
  action: string;
  decisionType?: string;
  approvedAmount?: number | null;
  comments?: string;
  finalConditions?: string;
  exceptionReason?: string;
  authorityLevel?: string;
}) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const found = await client.query<{ underwriting_case_id: string; loan_package_id: string; status: string; requested_amount: string; authority_level: string }>(
      `SELECT underwriting_case_id,loan_package_id,status,requested_amount::text,authority_level
       FROM credit_decisions WHERE institution_key=$1 AND credit_decision_id=$2 LIMIT 1`,
      [input.operator.institutionKey, input.creditDecisionId],
    );
    const current = found.rows[0];
    if (!current) throw new Error("CREDIT_DECISION_NOT_FOUND");

    if (input.action === "START_REVIEW") {
      await client.query(`UPDATE credit_decisions SET status='IN_REVIEW',updated_by=$3,updated_at=NOW() WHERE institution_key=$1 AND credit_decision_id=$2`, [input.operator.institutionKey, input.creditDecisionId, input.operator.userId]);
      await recordEvent(client, input.operator, input.creditDecisionId, current.underwriting_case_id, current.loan_package_id, current.status, "IN_REVIEW", "REVIEW_STARTED", {});
      return { status: "IN_REVIEW" };
    }

    if (input.action === "REQUEST_EXCEPTION") {
      if (!input.exceptionReason?.trim()) throw new Error("CREDIT_EXCEPTION_REASON_REQUIRED");
      await client.query(`UPDATE credit_decisions SET exception_requested=TRUE,exception_reason=$3,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND credit_decision_id=$2`, [input.operator.institutionKey, input.creditDecisionId, input.exceptionReason.trim(), input.operator.userId]);
      await recordEvent(client, input.operator, input.creditDecisionId, current.underwriting_case_id, current.loan_package_id, current.status, current.status, "EXCEPTION_REQUESTED", { reason: input.exceptionReason.trim() });
      return { status: current.status };
    }

    if (input.action === "SET_AUTHORITY") {
      const authority = input.authorityLevel || "";
      if (!authorityLevels.has(authority)) throw new Error("CREDIT_AUTHORITY_LEVEL_INVALID");
      await client.query(`UPDATE credit_decisions SET authority_level=$3,committee_required=($3='COMMITTEE'),updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND credit_decision_id=$2`, [input.operator.institutionKey, input.creditDecisionId, authority, input.operator.userId]);
      await recordEvent(client, input.operator, input.creditDecisionId, current.underwriting_case_id, current.loan_package_id, current.status, current.status, "AUTHORITY_CHANGED", { authority });
      return { status: current.status, authorityLevel: authority };
    }

    if (input.action === "DECIDE") {
      const decision = input.decisionType || "";
      if (!decisionTypes.has(decision)) throw new Error("CREDIT_DECISION_TYPE_INVALID");
      const approvedAmount = decision === "APPROVE" || decision === "CONDITIONAL_APPROVAL"
        ? Number(input.approvedAmount ?? current.requested_amount)
        : null;
      if (approvedAmount !== null && (!Number.isFinite(approvedAmount) || approvedAmount < 0 || approvedAmount > Number(current.requested_amount))) throw new Error("CREDIT_APPROVED_AMOUNT_INVALID");
      const resultingStatus = decision === "APPROVE" ? "APPROVED" : decision === "CONDITIONAL_APPROVAL" ? "CONDITIONAL_APPROVAL" : decision === "DECLINE" ? "DECLINED" : "RETURNED";
      await client.query(
        `UPDATE credit_decisions SET status=$3,decision_type=$4,approved_amount=$5,final_conditions=$6,decided_at=NOW(),decided_by=$7,updated_by=$7,updated_at=NOW()
         WHERE institution_key=$1 AND credit_decision_id=$2`,
        [input.operator.institutionKey, input.creditDecisionId, resultingStatus, decision, approvedAmount, input.finalConditions?.trim() || null, input.operator.userId],
      );
      await client.query(
        `INSERT INTO credit_approvals (credit_approval_id,institution_key,credit_decision_id,approver_user_id,approval_level,vote,comments)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (institution_key,credit_decision_id,approver_user_id)
         DO UPDATE SET approval_level=EXCLUDED.approval_level,vote=EXCLUDED.vote,comments=EXCLUDED.comments,signed_at=NOW()`,
        [randomUUID(), input.operator.institutionKey, input.creditDecisionId, input.operator.userId, current.authority_level, decision, input.comments?.trim() || null],
      );
      const loanStatus = resultingStatus === "APPROVED" ? "APPROVED" : resultingStatus === "CONDITIONAL_APPROVAL" ? "CONDITIONAL_APPROVAL" : resultingStatus === "DECLINED" ? "DECLINED" : "UNDER_REVIEW";
      await client.query(`UPDATE loan_packages SET status=$3,approved_amount=$4,decision_at=CASE WHEN $3 IN ('APPROVED','DECLINED','CONDITIONAL_APPROVAL') THEN NOW() ELSE decision_at END,updated_by=$5,updated_at=NOW() WHERE institution_key=$1 AND loan_package_id=$2`, [input.operator.institutionKey, current.loan_package_id, loanStatus, approvedAmount, input.operator.userId]);
      await client.query(`UPDATE underwriting_cases SET status='COMPLETED',completed_at=NOW(),updated_by=$3,updated_at=NOW() WHERE institution_key=$1 AND underwriting_case_id=$2`, [input.operator.institutionKey, current.underwriting_case_id, input.operator.userId]);
      await recordEvent(client, input.operator, input.creditDecisionId, current.underwriting_case_id, current.loan_package_id, current.status, resultingStatus, "FINAL_DECISION_RECORDED", { decision, approvedAmount, comments: input.comments?.trim() || null });
      return { status: resultingStatus, decisionType: decision, approvedAmount };
    }

    throw new Error("CREDIT_ACTION_INVALID");
  });
}

async function recordEvent(
  client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  operator: CreditOperator,
  decisionId: string,
  underwritingCaseId: string,
  loanPackageId: string,
  previousStatus: string | null,
  resultingStatus: string,
  eventType: string,
  eventData: Record<string, unknown>,
) {
  await client.query(
    `INSERT INTO credit_decision_events (credit_decision_event_id,institution_key,credit_decision_id,underwriting_case_id,loan_package_id,event_type,actor_user_id,previous_status,resulting_status,event_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
    [randomUUID(), operator.institutionKey, decisionId, underwritingCaseId, loanPackageId, eventType, operator.userId, previousStatus, resultingStatus, JSON.stringify(eventData)],
  );
}
import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

export type UnderwritingOperator = { institutionKey: string; userId: string };

const priorities = new Set(["LOW", "NORMAL", "HIGH", "URGENT"]);
const recommendations = new Set(["APPROVE", "CONDITIONAL_APPROVAL", "DECLINE", "RETURN_FOR_INFORMATION"]);
const conditionTypes = new Set(["IDENTITY", "INCOME", "CREDIT", "COLLATERAL", "VALUATION", "TITLE", "INSURANCE", "COMPLIANCE", "DOCUMENT", "OTHER"]);
const conditionStatuses = new Set(["OPEN", "IN_PROGRESS", "SATISFIED", "WAIVED", "FAILED"]);
const noteTypes = new Set(["INTERNAL", "RISK", "DOCUMENT", "COLLATERAL", "DECISION"]);

export async function listUnderwritingQueue(operator: UnderwritingOperator, query = "") {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const search = query.trim();
    const result = await client.query(
      `SELECT u.underwriting_case_id, u.loan_package_id, u.status, u.priority,
              u.assigned_underwriter_id, u.risk_score, u.recommendation, u.summary,
              u.created_at, u.updated_at, l.package_number, l.loan_type,
              l.requested_amount, l.approved_amount, l.currency_code,
              l.status AS loan_status, p.display_name AS customer_name,
              COALESCE(c.open_conditions, 0)::int AS open_conditions,
              COALESCE(c.total_conditions, 0)::int AS total_conditions,
              COALESCE(d.required_documents, 0)::int AS required_documents,
              COALESCE(d.missing_documents, 0)::int AS missing_documents,
              COALESCE(a.total_collateral_value, 0)::numeric AS total_collateral_value,
              CASE WHEN COALESCE(a.total_collateral_value, 0) > 0
                   THEN ROUND((l.requested_amount / a.total_collateral_value) * 100, 2)
                   ELSE NULL END AS requested_ltv
       FROM underwriting_cases u
       JOIN loan_packages l ON l.institution_key = u.institution_key AND l.loan_package_id = u.loan_package_id
       JOIN customer_profiles p ON p.institution_key = l.institution_key AND p.customer_id = l.primary_customer_id
       LEFT JOIN (
         SELECT institution_key, underwriting_case_id,
                COUNT(*) AS total_conditions,
                COUNT(*) FILTER (WHERE status IN ('OPEN','IN_PROGRESS','FAILED')) AS open_conditions
         FROM underwriting_conditions GROUP BY institution_key, underwriting_case_id
       ) c ON c.institution_key = u.institution_key AND c.underwriting_case_id = u.underwriting_case_id
       LEFT JOIN (
         SELECT institution_key, loan_package_id,
                COUNT(*) FILTER (WHERE required) AS required_documents,
                COUNT(*) FILTER (WHERE required AND frozen_version_id IS NULL) AS missing_documents
         FROM loan_package_documents GROUP BY institution_key, loan_package_id
       ) d ON d.institution_key = u.institution_key AND d.loan_package_id = u.loan_package_id
       LEFT JOIN (
         SELECT pc.institution_key, pc.loan_package_id,
                SUM(COALESCE(pc.pledged_value, fc.amount)) AS total_collateral_value
         FROM loan_package_collateral pc
         JOIN filing_office_collateral fc ON fc.institution_key = pc.institution_key AND fc.collateral_id = pc.collateral_id
         WHERE pc.status = 'ACTIVE' GROUP BY pc.institution_key, pc.loan_package_id
       ) a ON a.institution_key = u.institution_key AND a.loan_package_id = u.loan_package_id
       WHERE u.institution_key = $1
         AND ($2 = '' OR to_tsvector('english', coalesce(l.package_number, '') || ' ' || coalesce(p.display_name, '') || ' ' || coalesce(l.loan_type, '') || ' ' || coalesce(u.summary, '')) @@ plainto_tsquery('english', $2))
       ORDER BY CASE u.priority WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END, u.updated_at DESC
       LIMIT 250`,
      [operator.institutionKey, search],
    );
    return result.rows;
  });
}

export async function listEligibleLoanPackages(operator: UnderwritingOperator) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const result = await client.query(
      `SELECT l.loan_package_id, l.package_number, l.loan_type, l.status,
              l.requested_amount, l.currency_code, p.display_name AS customer_name
       FROM loan_packages l
       JOIN customer_profiles p ON p.institution_key = l.institution_key AND p.customer_id = l.primary_customer_id
       LEFT JOIN underwriting_cases u ON u.institution_key = l.institution_key AND u.loan_package_id = l.loan_package_id
       WHERE l.institution_key = $1 AND u.underwriting_case_id IS NULL
         AND l.status IN ('DRAFT','SUBMITTED','UNDER_REVIEW')
       ORDER BY l.updated_at DESC LIMIT 500`,
      [operator.institutionKey],
    );
    return result.rows;
  });
}

export async function createUnderwritingCase(input: { operator: UnderwritingOperator; loanPackageId: string; priority?: string; summary?: string }) {
  if (!input.loanPackageId) throw new Error("UNDERWRITING_LOAN_REQUIRED");
  const priority = input.priority || "NORMAL";
  if (!priorities.has(priority)) throw new Error("UNDERWRITING_PRIORITY_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const loan = await client.query(
      `SELECT loan_package_id, status FROM loan_packages WHERE institution_key = $1 AND loan_package_id = $2 LIMIT 1`,
      [input.operator.institutionKey, input.loanPackageId],
    );
    if (!loan.rows[0]) throw new Error("LOAN_NOT_FOUND");
    const existing = await client.query(
      `SELECT underwriting_case_id FROM underwriting_cases WHERE institution_key = $1 AND loan_package_id = $2 LIMIT 1`,
      [input.operator.institutionKey, input.loanPackageId],
    );
    if (existing.rows[0]) throw new Error("UNDERWRITING_CASE_EXISTS");
    const caseId = randomUUID();
    await client.query(
      `INSERT INTO underwriting_cases (
         underwriting_case_id, institution_key, loan_package_id, status, priority,
         assigned_underwriter_id, summary, submitted_at, created_by, updated_by
       ) VALUES ($1,$2,$3,'QUEUED',$4,$5,$6,NOW(),$5,$5)`,
      [caseId, input.operator.institutionKey, input.loanPackageId, priority, input.operator.userId, input.summary?.trim() || null],
    );
    await client.query(
      `UPDATE loan_packages SET status = 'UNDER_REVIEW', submitted_at = COALESCE(submitted_at, NOW()), updated_by = $3, updated_at = NOW()
       WHERE institution_key = $1 AND loan_package_id = $2`,
      [input.operator.institutionKey, input.loanPackageId, input.operator.userId],
    );
    await client.query(
      `INSERT INTO underwriting_events (underwriting_event_id, institution_key, underwriting_case_id, loan_package_id, event_type, actor_user_id, resulting_status, event_data)
       VALUES ($1,$2,$3,$4,'CASE_CREATED',$5,'QUEUED',$6::jsonb)`,
      [randomUUID(), input.operator.institutionKey, caseId, input.loanPackageId, input.operator.userId, JSON.stringify({ priority })],
    );
    return { underwritingCaseId: caseId, status: "QUEUED" };
  });
}

export async function updateUnderwritingCase(input: {
  operator: UnderwritingOperator;
  underwritingCaseId: string;
  action: string;
  riskScore?: number | null;
  recommendation?: string;
  summary?: string;
  conditionType?: string;
  conditionTitle?: string;
  conditionDescription?: string;
  conditionId?: string;
  conditionStatus?: string;
  noteType?: string;
  noteText?: string;
}) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const found = await client.query<{ underwriting_case_id: string; loan_package_id: string; status: string }>(
      `SELECT underwriting_case_id, loan_package_id, status FROM underwriting_cases
       WHERE institution_key = $1 AND underwriting_case_id = $2 LIMIT 1`,
      [input.operator.institutionKey, input.underwritingCaseId],
    );
    const current = found.rows[0];
    if (!current) throw new Error("UNDERWRITING_CASE_NOT_FOUND");

    if (input.action === "START_REVIEW") {
      await client.query(`UPDATE underwriting_cases SET status='IN_REVIEW', review_started_at=COALESCE(review_started_at,NOW()), assigned_underwriter_id=$3, updated_by=$3, updated_at=NOW() WHERE institution_key=$1 AND underwriting_case_id=$2`, [input.operator.institutionKey, input.underwritingCaseId, input.operator.userId]);
      await recordEvent(client, input, current.loan_package_id, current.status, "IN_REVIEW", "REVIEW_STARTED", {});
      return { status: "IN_REVIEW" };
    }

    if (input.action === "SAVE_ASSESSMENT") {
      const riskScore = input.riskScore === null || input.riskScore === undefined || Number.isNaN(input.riskScore) ? null : Number(input.riskScore);
      if (riskScore !== null && (!Number.isFinite(riskScore) || riskScore < 0 || riskScore > 1000)) throw new Error("UNDERWRITING_RISK_SCORE_INVALID");
      await client.query(`UPDATE underwriting_cases SET risk_score=$3, summary=$4, updated_by=$5, updated_at=NOW() WHERE institution_key=$1 AND underwriting_case_id=$2`, [input.operator.institutionKey, input.underwritingCaseId, riskScore, input.summary?.trim() || null, input.operator.userId]);
      await client.query(`UPDATE loan_packages SET risk_score=$3, underwriting_notes=$4, updated_by=$5, updated_at=NOW() WHERE institution_key=$1 AND loan_package_id=$2`, [input.operator.institutionKey, current.loan_package_id, riskScore, input.summary?.trim() || null, input.operator.userId]);
      await recordEvent(client, input, current.loan_package_id, current.status, current.status, "ASSESSMENT_SAVED", { riskScore });
      return { status: current.status };
    }

    if (input.action === "ADD_CONDITION") {
      const type = input.conditionType || "OTHER";
      if (!conditionTypes.has(type)) throw new Error("UNDERWRITING_CONDITION_TYPE_INVALID");
      if (!input.conditionTitle?.trim()) throw new Error("UNDERWRITING_CONDITION_TITLE_REQUIRED");
      const conditionId = randomUUID();
      await client.query(`INSERT INTO underwriting_conditions (underwriting_condition_id,institution_key,underwriting_case_id,condition_type,title,description,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [conditionId, input.operator.institutionKey, input.underwritingCaseId, type, input.conditionTitle.trim(), input.conditionDescription?.trim() || null, input.operator.userId]);
      await recordEvent(client, input, current.loan_package_id, current.status, current.status, "CONDITION_ADDED", { conditionId, type, title: input.conditionTitle.trim() });
      return { conditionId, status: current.status };
    }

    if (input.action === "UPDATE_CONDITION") {
      if (!input.conditionId) throw new Error("UNDERWRITING_CONDITION_REQUIRED");
      const status = input.conditionStatus || "OPEN";
      if (!conditionStatuses.has(status)) throw new Error("UNDERWRITING_CONDITION_STATUS_INVALID");
      const resolved = ["SATISFIED", "WAIVED", "FAILED"].includes(status);
      const result = await client.query(`UPDATE underwriting_conditions SET status=$4, satisfied_at=CASE WHEN $4='SATISFIED' THEN NOW() ELSE satisfied_at END, waived_at=CASE WHEN $4='WAIVED' THEN NOW() ELSE waived_at END, resolved_by=CASE WHEN $5 THEN $3 ELSE resolved_by END, updated_at=NOW() WHERE institution_key=$1 AND underwriting_case_id=$2 AND underwriting_condition_id=$6 RETURNING underwriting_condition_id`, [input.operator.institutionKey, input.underwritingCaseId, input.operator.userId, status, resolved, input.conditionId]);
      if (!result.rows[0]) throw new Error("UNDERWRITING_CONDITION_NOT_FOUND");
      await recordEvent(client, input, current.loan_package_id, current.status, current.status, "CONDITION_UPDATED", { conditionId: input.conditionId, status });
      return { status: current.status };
    }

    if (input.action === "ADD_NOTE") {
      const type = input.noteType || "INTERNAL";
      if (!noteTypes.has(type)) throw new Error("UNDERWRITING_NOTE_TYPE_INVALID");
      if (!input.noteText?.trim()) throw new Error("UNDERWRITING_NOTE_REQUIRED");
      const noteId = randomUUID();
      await client.query(`INSERT INTO underwriting_notes (underwriting_note_id,institution_key,underwriting_case_id,note_type,note_text,created_by) VALUES ($1,$2,$3,$4,$5,$6)`, [noteId, input.operator.institutionKey, input.underwritingCaseId, type, input.noteText.trim(), input.operator.userId]);
      await recordEvent(client, input, current.loan_package_id, current.status, current.status, "NOTE_ADDED", { noteId, type });
      return { noteId, status: current.status };
    }

    if (input.action === "RECOMMEND") {
      const recommendation = input.recommendation || "";
      if (!recommendations.has(recommendation)) throw new Error("UNDERWRITING_RECOMMENDATION_INVALID");
      const unresolved = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM underwriting_conditions WHERE institution_key=$1 AND underwriting_case_id=$2 AND required=TRUE AND status IN ('OPEN','IN_PROGRESS','FAILED')`, [input.operator.institutionKey, input.underwritingCaseId]);
      const openCount = Number(unresolved.rows[0]?.count || 0);
      if (recommendation === "APPROVE" && openCount > 0) throw new Error("UNDERWRITING_REQUIRED_CONDITIONS_OPEN");
      const resultingStatus = recommendation === "APPROVE" ? "RECOMMENDED_APPROVAL" : recommendation === "DECLINE" ? "RECOMMENDED_DECLINE" : "CONDITIONAL";
      await client.query(`UPDATE underwriting_cases SET recommendation=$3,status=$4,recommendation_at=NOW(),updated_by=$5,updated_at=NOW() WHERE institution_key=$1 AND underwriting_case_id=$2`, [input.operator.institutionKey, input.underwritingCaseId, recommendation, resultingStatus, input.operator.userId]);
      await recordEvent(client, input, current.loan_package_id, current.status, resultingStatus, "RECOMMENDATION_RECORDED", { recommendation, openConditions: openCount });
      return { status: resultingStatus, recommendation };
    }

    throw new Error("UNDERWRITING_ACTION_INVALID");
  });
}

async function recordEvent(client: any, input: { operator: UnderwritingOperator; underwritingCaseId: string }, loanPackageId: string, previousStatus: string, resultingStatus: string, eventType: string, eventData: Record<string, unknown>) {
  await client.query(
    `INSERT INTO underwriting_events (underwriting_event_id,institution_key,underwriting_case_id,loan_package_id,event_type,actor_user_id,previous_status,resulting_status,event_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
    [randomUUID(), input.operator.institutionKey, input.underwritingCaseId, loanPackageId, eventType, input.operator.userId, previousStatus, resultingStatus, JSON.stringify(eventData)],
  );
}

export async function getUnderwritingCaseDetail(operator: UnderwritingOperator, underwritingCaseId: string) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const [caseResult, conditions, notes, events] = await Promise.all([
      client.query(`SELECT u.*, l.package_number, l.loan_type, l.requested_amount, l.approved_amount, l.currency_code, l.status AS loan_status, p.display_name AS customer_name FROM underwriting_cases u JOIN loan_packages l ON l.institution_key=u.institution_key AND l.loan_package_id=u.loan_package_id JOIN customer_profiles p ON p.institution_key=l.institution_key AND p.customer_id=l.primary_customer_id WHERE u.institution_key=$1 AND u.underwriting_case_id=$2 LIMIT 1`, [operator.institutionKey, underwritingCaseId]),
      client.query(`SELECT * FROM underwriting_conditions WHERE institution_key=$1 AND underwriting_case_id=$2 ORDER BY created_at ASC`, [operator.institutionKey, underwritingCaseId]),
      client.query(`SELECT * FROM underwriting_notes WHERE institution_key=$1 AND underwriting_case_id=$2 ORDER BY created_at DESC LIMIT 200`, [operator.institutionKey, underwritingCaseId]),
      client.query(`SELECT * FROM underwriting_events WHERE institution_key=$1 AND underwriting_case_id=$2 ORDER BY occurred_at DESC LIMIT 300`, [operator.institutionKey, underwritingCaseId]),
    ]);
    if (!caseResult.rows[0]) throw new Error("UNDERWRITING_CASE_NOT_FOUND");
    return { underwritingCase: caseResult.rows[0], conditions: conditions.rows, notes: notes.rows, events: events.rows };
  });
}
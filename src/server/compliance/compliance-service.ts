import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

export type ComplianceOperator = { institutionKey: string; userId: string };

function alertNumber() {
  return `AML-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function caseNumber() {
  return `CASE-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function riskNumber() {
  return `RISK-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function listComplianceWorkspace(operator: ComplianceOperator, query = "") {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const [profiles, alerts, cases, risks, summary] = await Promise.all([
      client.query(
        `SELECT p.compliance_profile_id,p.customer_id,p.cip_status,p.kyc_status,p.risk_rating,p.customer_type,
                p.sanctions_status,p.pep_status,p.next_review_date,p.last_reviewed_at,
                c.display_name,c.customer_number
         FROM compliance_profiles p
         JOIN customer_profiles c ON c.institution_key=p.institution_key AND c.customer_id=p.customer_id
         WHERE p.institution_key=$1
           AND ($2='' OR to_tsvector('english',coalesce(c.display_name,'')||' '||coalesce(c.customer_number,'')) @@ plainto_tsquery('english',$2))
         ORDER BY CASE p.risk_rating WHEN 'PROHIBITED' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,p.next_review_date NULLS LAST
         LIMIT 300`,
        [operator.institutionKey, query.trim()],
      ),
      client.query(
        `SELECT a.aml_alert_id,a.alert_number,a.alert_type,a.severity,a.score,a.status,a.summary,a.opened_at,a.assigned_to,
                c.display_name AS customer_name,p.payment_number
         FROM aml_alerts a
         LEFT JOIN customer_profiles c ON c.institution_key=a.institution_key AND c.customer_id=a.customer_id
         LEFT JOIN treasury_payments p ON p.institution_key=a.institution_key AND p.treasury_payment_id=a.treasury_payment_id
         WHERE a.institution_key=$1
           AND ($2='' OR to_tsvector('english',coalesce(a.alert_number,'')||' '||coalesce(a.summary,'')||' '||coalesce(c.display_name,'')) @@ plainto_tsquery('english',$2))
         ORDER BY CASE a.status WHEN 'OPEN' THEN 1 WHEN 'IN_REVIEW' THEN 2 WHEN 'ESCALATED' THEN 3 ELSE 4 END,
                  CASE a.severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,a.opened_at DESC
         LIMIT 300`,
        [operator.institutionKey, query.trim()],
      ),
      client.query(
        `SELECT compliance_case_id,case_number,case_type,status,priority,title,due_date,assigned_to,regulatory_filing_required,regulatory_filing_type,opened_at
         FROM compliance_cases
         WHERE institution_key=$1
           AND ($2='' OR to_tsvector('english',coalesce(case_number,'')||' '||coalesce(title,'')||' '||coalesce(description,'')) @@ plainto_tsquery('english',$2))
         ORDER BY CASE status WHEN 'OPEN' THEN 1 WHEN 'IN_REVIEW' THEN 2 WHEN 'ESCALATED' THEN 3 ELSE 4 END,
                  CASE priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,opened_at DESC
         LIMIT 300`,
        [operator.institutionKey, query.trim()],
      ),
      client.query(
        `SELECT risk_item_id,risk_number,category,title,likelihood,impact,inherent_score,residual_score,status,review_date,owner_user_id
         FROM enterprise_risk_items WHERE institution_key=$1
         ORDER BY residual_score DESC,created_at DESC LIMIT 300`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT
           (SELECT COUNT(*)::int FROM compliance_profiles WHERE institution_key=$1 AND risk_rating IN ('HIGH','PROHIBITED')) AS high_risk_customers,
           (SELECT COUNT(*)::int FROM aml_alerts WHERE institution_key=$1 AND status IN ('OPEN','IN_REVIEW','ESCALATED')) AS open_alerts,
           (SELECT COUNT(*)::int FROM compliance_cases WHERE institution_key=$1 AND status <> 'CLOSED') AS open_cases,
           (SELECT COUNT(*)::int FROM compliance_profiles WHERE institution_key=$1 AND next_review_date IS NOT NULL AND next_review_date <= CURRENT_DATE + 30) AS reviews_due,
           (SELECT COUNT(*)::int FROM enterprise_risk_items WHERE institution_key=$1 AND status <> 'CLOSED' AND residual_score >= 15) AS elevated_risks`,
        [operator.institutionKey],
      ),
    ]);
    return { profiles: profiles.rows, alerts: alerts.rows, cases: cases.rows, risks: risks.rows, summary: summary.rows[0] };
  });
}

export async function createComplianceProfile(input: {
  operator: ComplianceOperator;
  customerId: string;
  customerType: string;
  riskRating?: string;
  beneficialOwnershipRequired?: boolean;
  nextReviewDate?: string;
}) {
  if (!input.customerId) throw new Error("COMPLIANCE_CUSTOMER_REQUIRED");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const customer = await client.query(`SELECT customer_id FROM customer_profiles WHERE institution_key=$1 AND customer_id=$2 LIMIT 1`, [input.operator.institutionKey, input.customerId]);
    if (!customer.rows[0]) throw new Error("COMPLIANCE_CUSTOMER_NOT_FOUND");
    const id = randomUUID();
    await client.query(
      `INSERT INTO compliance_profiles (compliance_profile_id,institution_key,customer_id,customer_type,risk_rating,beneficial_ownership_required,next_review_date,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
      [id,input.operator.institutionKey,input.customerId,input.customerType || "INDIVIDUAL",input.riskRating || "MEDIUM",Boolean(input.beneficialOwnershipRequired),input.nextReviewDate || null,input.operator.userId],
    );
    await recordEvent(client,input.operator,{ profileId: id },"PROFILE_CREATED",null,"PENDING",{ customerId: input.customerId });
    return { complianceProfileId: id };
  });
}

export async function createAmlAlert(input: {
  operator: ComplianceOperator;
  customerId?: string;
  treasuryPaymentId?: string;
  servicingLoanId?: string;
  alertType: string;
  severity: string;
  score: number;
  summary: string;
}) {
  if (!input.alertType.trim() || !input.summary.trim()) throw new Error("COMPLIANCE_ALERT_FIELDS_REQUIRED");
  if (!Number.isInteger(input.score) || input.score < 0 || input.score > 100) throw new Error("COMPLIANCE_ALERT_SCORE_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const id = randomUUID();
    const number = alertNumber();
    await client.query(
      `INSERT INTO aml_alerts (aml_alert_id,institution_key,alert_number,customer_id,treasury_payment_id,servicing_loan_id,alert_type,severity,score,summary,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
      [id,input.operator.institutionKey,number,input.customerId || null,input.treasuryPaymentId || null,input.servicingLoanId || null,input.alertType.trim(),input.severity,input.score,input.summary.trim(),input.operator.userId],
    );
    await recordEvent(client,input.operator,{ alertId: id },"AML_ALERT_CREATED",null,"OPEN",{ alertNumber: number, severity: input.severity, score: input.score });
    return { amlAlertId: id, alertNumber: number, status: "OPEN" };
  });
}

export async function createComplianceCase(input: {
  operator: ComplianceOperator;
  customerId?: string;
  caseType: string;
  priority: string;
  title: string;
  description?: string;
  amlAlertId?: string;
  dueDate?: string;
}) {
  if (!input.caseType.trim() || !input.title.trim()) throw new Error("COMPLIANCE_CASE_FIELDS_REQUIRED");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const id = randomUUID();
    const number = caseNumber();
    await client.query(
      `INSERT INTO compliance_cases (compliance_case_id,institution_key,case_number,customer_id,case_type,priority,title,description,due_date,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`,
      [id,input.operator.institutionKey,number,input.customerId || null,input.caseType.trim(),input.priority,input.title.trim(),input.description?.trim() || null,input.dueDate || null,input.operator.userId],
    );
    if (input.amlAlertId) {
      await client.query(`INSERT INTO compliance_case_alerts (institution_key,compliance_case_id,aml_alert_id,linked_by) VALUES ($1,$2,$3,$4)`, [input.operator.institutionKey,id,input.amlAlertId,input.operator.userId]);
    }
    await recordEvent(client,input.operator,{ caseId: id },"CASE_CREATED",null,"OPEN",{ caseNumber: number, priority: input.priority });
    return { complianceCaseId: id, caseNumber: number, status: "OPEN" };
  });
}

export async function createRiskItem(input: {
  operator: ComplianceOperator;
  category: string;
  title: string;
  description?: string;
  likelihood: number;
  impact: number;
  residualScore: number;
  mitigationPlan?: string;
  reviewDate?: string;
}) {
  if (!input.category.trim() || !input.title.trim()) throw new Error("COMPLIANCE_RISK_FIELDS_REQUIRED");
  if (![input.likelihood,input.impact].every((value) => Number.isInteger(value) && value >= 1 && value <= 5)) throw new Error("COMPLIANCE_RISK_RATING_INVALID");
  if (!Number.isInteger(input.residualScore) || input.residualScore < 1 || input.residualScore > 25) throw new Error("COMPLIANCE_RISK_RESIDUAL_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const id = randomUUID();
    const number = riskNumber();
    const inherentScore = input.likelihood * input.impact;
    await client.query(
      `INSERT INTO enterprise_risk_items (risk_item_id,institution_key,risk_number,category,title,description,likelihood,impact,inherent_score,residual_score,mitigation_plan,review_date,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)`,
      [id,input.operator.institutionKey,number,input.category.trim(),input.title.trim(),input.description?.trim() || null,input.likelihood,input.impact,inherentScore,input.residualScore,input.mitigationPlan?.trim() || null,input.reviewDate || null,input.operator.userId],
    );
    await recordEvent(client,input.operator,{ riskId: id },"RISK_CREATED",null,"OPEN",{ riskNumber: number, inherentScore, residualScore: input.residualScore });
    return { riskItemId: id, riskNumber: number, status: "OPEN" };
  });
}

export async function updateComplianceItem(input: {
  operator: ComplianceOperator;
  itemType: string;
  itemId: string;
  action: string;
  notes?: string;
  riskRating?: string;
  cipStatus?: string;
  kycStatus?: string;
  sanctionsStatus?: string;
  pepStatus?: string;
  nextReviewDate?: string;
}) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    if (input.itemType === "PROFILE") {
      const found = await client.query<{ kyc_status: string }>(`SELECT kyc_status FROM compliance_profiles WHERE institution_key=$1 AND compliance_profile_id=$2 FOR UPDATE`, [input.operator.institutionKey,input.itemId]);
      if (!found.rows[0]) throw new Error("COMPLIANCE_PROFILE_NOT_FOUND");
      await client.query(
        `UPDATE compliance_profiles SET risk_rating=COALESCE(NULLIF($3,''),risk_rating),cip_status=COALESCE(NULLIF($4,''),cip_status),kyc_status=COALESCE(NULLIF($5,''),kyc_status),sanctions_status=COALESCE(NULLIF($6,''),sanctions_status),pep_status=COALESCE(NULLIF($7,''),pep_status),next_review_date=COALESCE($8::date,next_review_date),last_reviewed_at=NOW(),last_reviewed_by=$9,updated_by=$9,updated_at=NOW() WHERE institution_key=$1 AND compliance_profile_id=$2`,
        [input.operator.institutionKey,input.itemId,input.riskRating || "",input.cipStatus || "",input.kycStatus || "",input.sanctionsStatus || "",input.pepStatus || "",input.nextReviewDate || null,input.operator.userId],
      );
      await recordEvent(client,input.operator,{ profileId: input.itemId },"PROFILE_REVIEWED",found.rows[0].kyc_status,input.kycStatus || found.rows[0].kyc_status,{ notes: input.notes || null });
      return { status: input.kycStatus || found.rows[0].kyc_status };
    }

    if (input.itemType === "ALERT") {
      const transitions: Record<string,{ from: string[]; to: string }> = {
        START_REVIEW: { from: ["OPEN"], to: "IN_REVIEW" },
        ESCALATE: { from: ["OPEN","IN_REVIEW"], to: "ESCALATED" },
        CLOSE: { from: ["OPEN","IN_REVIEW","ESCALATED"], to: "CLOSED" },
        DISMISS: { from: ["OPEN","IN_REVIEW"], to: "DISMISSED" },
      };
      const found = await client.query<{ status: string }>(`SELECT status FROM aml_alerts WHERE institution_key=$1 AND aml_alert_id=$2 FOR UPDATE`, [input.operator.institutionKey,input.itemId]);
      if (!found.rows[0]) throw new Error("COMPLIANCE_ALERT_NOT_FOUND");
      const transition = transitions[input.action];
      if (!transition || !transition.from.includes(found.rows[0].status)) throw new Error("COMPLIANCE_ALERT_ACTION_INVALID");
      await client.query(`UPDATE aml_alerts SET status=$3,assigned_to=COALESCE(assigned_to,$4),disposition_notes=CASE WHEN $3 IN ('CLOSED','DISMISSED') THEN $5 ELSE disposition_notes END,closed_at=CASE WHEN $3 IN ('CLOSED','DISMISSED') THEN NOW() ELSE closed_at END,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND aml_alert_id=$2`, [input.operator.institutionKey,input.itemId,transition.to,input.operator.userId,input.notes?.trim() || null]);
      await recordEvent(client,input.operator,{ alertId: input.itemId },`ALERT_${transition.to}`,found.rows[0].status,transition.to,{ notes: input.notes || null });
      return { status: transition.to };
    }

    if (input.itemType === "CASE") {
      const transitions: Record<string,{ from: string[]; to: string }> = {
        START_REVIEW: { from: ["OPEN","AWAITING_INFORMATION"], to: "IN_REVIEW" },
        REQUEST_INFORMATION: { from: ["OPEN","IN_REVIEW"], to: "AWAITING_INFORMATION" },
        ESCALATE: { from: ["OPEN","IN_REVIEW","AWAITING_INFORMATION"], to: "ESCALATED" },
        CLOSE: { from: ["OPEN","IN_REVIEW","AWAITING_INFORMATION","ESCALATED"], to: "CLOSED" },
      };
      const found = await client.query<{ status: string }>(`SELECT status FROM compliance_cases WHERE institution_key=$1 AND compliance_case_id=$2 FOR UPDATE`, [input.operator.institutionKey,input.itemId]);
      if (!found.rows[0]) throw new Error("COMPLIANCE_CASE_NOT_FOUND");
      const transition = transitions[input.action];
      if (!transition || !transition.from.includes(found.rows[0].status)) throw new Error("COMPLIANCE_CASE_ACTION_INVALID");
      await client.query(`UPDATE compliance_cases SET status=$3,assigned_to=COALESCE(assigned_to,$4),closed_at=CASE WHEN $3='CLOSED' THEN NOW() ELSE closed_at END,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND compliance_case_id=$2`, [input.operator.institutionKey,input.itemId,transition.to,input.operator.userId]);
      await recordEvent(client,input.operator,{ caseId: input.itemId },`CASE_${transition.to}`,found.rows[0].status,transition.to,{ notes: input.notes || null });
      return { status: transition.to };
    }

    throw new Error("COMPLIANCE_ITEM_TYPE_INVALID");
  });
}

async function recordEvent(
  client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  operator: ComplianceOperator,
  ids: { profileId?: string; alertId?: string; caseId?: string; riskId?: string },
  eventType: string,
  previousStatus: string | null,
  resultingStatus: string | null,
  eventData: Record<string, unknown>,
) {
  await client.query(
    `INSERT INTO compliance_events (compliance_event_id,institution_key,compliance_profile_id,aml_alert_id,compliance_case_id,risk_item_id,event_type,actor_user_id,previous_status,resulting_status,event_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
    [randomUUID(),operator.institutionKey,ids.profileId || null,ids.alertId || null,ids.caseId || null,ids.riskId || null,eventType,operator.userId,previousStatus,resultingStatus,JSON.stringify(eventData)],
  );
}
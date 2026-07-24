import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "@/server/finance/postgres-database";

type OperatorIdentity = {
  institutionKey: string;
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
};

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export type ApprovalRecord = {
  approval_id: string;
  institution_key: string;
  request_type: string;
  subject_type: string;
  subject_id: string | null;
  title: string;
  description: string | null;
  department: string;
  priority: string;
  status: ApprovalStatus;
  requested_by_user_id: string;
  requested_by_email: string;
  assigned_role: string | null;
  decision_by_user_id: string | null;
  decision_by_email: string | null;
  decision_reason: string | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
};

async function ensureApprovalSchema(client: { query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: Row[]; rowCount: number | null }> }) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS institutional_approvals (
      approval_id UUID PRIMARY KEY,
      institution_key TEXT NOT NULL,
      request_type TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      department TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'NORMAL',
      status TEXT NOT NULL DEFAULT 'PENDING',
      requested_by_user_id TEXT NOT NULL,
      requested_by_email TEXT NOT NULL,
      assigned_role TEXT,
      decision_by_user_id TEXT,
      decision_by_email TEXT,
      decision_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      decided_at TIMESTAMPTZ,
      CONSTRAINT institutional_approvals_status_check CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED'))
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS institutional_approvals_institution_status_idx ON institutional_approvals (institution_key, status, created_at DESC)`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS institutional_approval_events (
      event_id UUID PRIMARY KEY,
      approval_id UUID NOT NULL REFERENCES institutional_approvals(approval_id) ON DELETE CASCADE,
      institution_key TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor_user_id TEXT NOT NULL,
      actor_email TEXT NOT NULL,
      reason TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS institutional_approval_events_approval_idx ON institutional_approval_events (approval_id, occurred_at DESC)`);
}

function clean(value: unknown, maximum = 5000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function canDecide(operator: OperatorIdentity) {
  const roles = new Set(operator.roles.map((role) => role.toLowerCase()));
  const permissions = new Set(operator.permissions.map((permission) => permission.toLowerCase()));
  return roles.has("institution_administrator") || roles.has("administrator") || roles.has("executive") || permissions.has("approvals.decide") || permissions.has("institution.approvals.decide");
}

export async function listApprovals(operator: OperatorIdentity, status = "") {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    await ensureApprovalSchema(client);
    const normalizedStatus = clean(status, 20).toUpperCase();
    const values: unknown[] = [operator.institutionKey];
    let where = "institution_key = $1";
    if (normalizedStatus && ["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(normalizedStatus)) {
      values.push(normalizedStatus);
      where += ` AND status = $${values.length}`;
    }
    const result = await client.query<ApprovalRecord>(`SELECT * FROM institutional_approvals WHERE ${where} ORDER BY CASE priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END, created_at DESC`, values);
    return result.rows;
  });
}

export async function createApproval(operator: OperatorIdentity, input: Record<string, unknown>) {
  const title = clean(input.title, 200);
  const requestType = clean(input.requestType, 80).toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const subjectType = clean(input.subjectType, 80).toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const department = clean(input.department, 80).toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const priority = clean(input.priority || "NORMAL", 20).toUpperCase();
  if (!title) throw new Error("APPROVAL_TITLE_REQUIRED");
  if (!requestType) throw new Error("APPROVAL_REQUEST_TYPE_REQUIRED");
  if (!subjectType) throw new Error("APPROVAL_SUBJECT_TYPE_REQUIRED");
  if (!department) throw new Error("APPROVAL_DEPARTMENT_REQUIRED");
  if (!["NORMAL", "HIGH", "URGENT"].includes(priority)) throw new Error("APPROVAL_PRIORITY_INVALID");

  const approvalId = randomUUID();
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    await ensureApprovalSchema(client);
    const result = await client.query<ApprovalRecord>(`
      INSERT INTO institutional_approvals (
        approval_id, institution_key, request_type, subject_type, subject_id, title, description,
        department, priority, requested_by_user_id, requested_by_email, assigned_role
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [approvalId, operator.institutionKey, requestType, subjectType, clean(input.subjectId, 200) || null, title, clean(input.description) || null, department, priority, operator.userId, operator.email, clean(input.assignedRole, 120) || null]);
    await client.query(`INSERT INTO institutional_approval_events (event_id, approval_id, institution_key, event_type, actor_user_id, actor_email, metadata) VALUES ($1,$2,$3,'APPROVAL_REQUESTED',$4,$5,$6::jsonb)`, [randomUUID(), approvalId, operator.institutionKey, operator.userId, operator.email, JSON.stringify({ requestType, subjectType, department, priority })]);
    return result.rows[0];
  });
}

export async function decideApproval(operator: OperatorIdentity, approvalId: string, action: string, reason: string) {
  if (!canDecide(operator)) throw new Error("APPROVAL_DECISION_FORBIDDEN");
  const normalizedAction = clean(action, 20).toUpperCase();
  if (!["APPROVE", "REJECT", "CANCEL"].includes(normalizedAction)) throw new Error("APPROVAL_ACTION_INVALID");
  const nextStatus: ApprovalStatus = normalizedAction === "APPROVE" ? "APPROVED" : normalizedAction === "REJECT" ? "REJECTED" : "CANCELLED";
  const cleanReason = clean(reason, 2000);
  if ((nextStatus === "REJECTED" || nextStatus === "CANCELLED") && !cleanReason) throw new Error("APPROVAL_REASON_REQUIRED");

  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    await ensureApprovalSchema(client);
    const result = await client.query<ApprovalRecord>(`
      UPDATE institutional_approvals
      SET status = $4, decision_by_user_id = $5, decision_by_email = $6, decision_reason = $7,
          decided_at = NOW(), updated_at = NOW()
      WHERE institution_key = $1 AND approval_id = $2 AND status = $3
      RETURNING *
    `, [operator.institutionKey, approvalId, "PENDING", nextStatus, operator.userId, operator.email, cleanReason || null]);
    const approval = result.rows[0];
    if (!approval) throw new Error("APPROVAL_NOT_PENDING");
    await client.query(`INSERT INTO institutional_approval_events (event_id, approval_id, institution_key, event_type, actor_user_id, actor_email, reason, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [randomUUID(), approvalId, operator.institutionKey, `APPROVAL_${nextStatus}`, operator.userId, operator.email, cleanReason || null, JSON.stringify({ previousStatus: "PENDING", status: nextStatus })]);
    return approval;
  });
}

export async function listApprovalEvents(operator: OperatorIdentity, approvalId: string) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    await ensureApprovalSchema(client);
    const exists = await client.query(`SELECT 1 FROM institutional_approvals WHERE institution_key = $1 AND approval_id = $2`, [operator.institutionKey, approvalId]);
    if (!exists.rowCount) throw new Error("APPROVAL_NOT_FOUND");
    const result = await client.query(`SELECT * FROM institutional_approval_events WHERE institution_key = $1 AND approval_id = $2 ORDER BY occurred_at DESC`, [operator.institutionKey, approvalId]);
    return result.rows;
  });
}

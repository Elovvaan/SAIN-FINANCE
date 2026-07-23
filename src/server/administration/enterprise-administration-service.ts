import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

export type AdministrationOperator = { institutionKey: string; userId: string };

const branchStatuses = new Set(["ACTIVE", "INACTIVE", "CLOSED"]);
const roleStatuses = new Set(["ACTIVE", "INACTIVE"]);
const productStatuses = new Set(["DRAFT", "ACTIVE", "INACTIVE", "RETIRED"]);
const workflowStatuses = new Set(["DRAFT", "ACTIVE", "INACTIVE", "RETIRED"]);

export async function listAdministrationWorkspace(operator: AdministrationOperator, query = "") {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const q = query.trim();
    const [branches, roles, assignments, products, workflows, settings, summary] = await Promise.all([
      client.query(
        `SELECT branch_id,branch_code,branch_name,status,timezone,address,created_at,updated_at
         FROM admin_branches
         WHERE institution_key=$1 AND ($2='' OR branch_code ILIKE '%'||$2||'%' OR branch_name ILIKE '%'||$2||'%')
         ORDER BY status,branch_code LIMIT 200`,
        [operator.institutionKey,q],
      ),
      client.query(
        `SELECT role_id,role_code,role_name,description,status,permissions,approval_limit,created_at,updated_at
         FROM admin_roles
         WHERE institution_key=$1 AND ($2='' OR role_code ILIKE '%'||$2||'%' OR role_name ILIKE '%'||$2||'%')
         ORDER BY status,role_code LIMIT 200`,
        [operator.institutionKey,q],
      ),
      client.query(
        `SELECT a.assignment_id,a.user_id,a.status,a.effective_from,a.effective_to,a.assigned_at,
                r.role_code,r.role_name,b.branch_code,b.branch_name
         FROM admin_user_assignments a
         JOIN admin_roles r ON r.institution_key=a.institution_key AND r.role_id=a.role_id
         LEFT JOIN admin_branches b ON b.institution_key=a.institution_key AND b.branch_id=a.branch_id
         WHERE a.institution_key=$1 AND ($2='' OR a.user_id ILIKE '%'||$2||'%' OR r.role_name ILIKE '%'||$2||'%')
         ORDER BY a.status,a.assigned_at DESC LIMIT 300`,
        [operator.institutionKey,q],
      ),
      client.query(
        `SELECT loan_product_id,product_code,product_name,status,min_amount,max_amount,min_rate,max_rate,min_term_months,max_term_months,fee_schedule,policy_rules,updated_at
         FROM admin_loan_products
         WHERE institution_key=$1 AND ($2='' OR product_code ILIKE '%'||$2||'%' OR product_name ILIKE '%'||$2||'%')
         ORDER BY status,product_code LIMIT 200`,
        [operator.institutionKey,q],
      ),
      client.query(
        `SELECT workflow_id,workflow_code,workflow_name,module,status,version,definition,updated_at
         FROM admin_workflows
         WHERE institution_key=$1 AND ($2='' OR workflow_code ILIKE '%'||$2||'%' OR workflow_name ILIKE '%'||$2||'%' OR module ILIKE '%'||$2||'%')
         ORDER BY module,status,workflow_code,version DESC LIMIT 200`,
        [operator.institutionKey,q],
      ),
      client.query(
        `SELECT setting_id,setting_key,setting_value,description,is_sensitive,updated_at
         FROM admin_settings WHERE institution_key=$1 ORDER BY setting_key LIMIT 300`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT
           (SELECT COUNT(*)::int FROM admin_branches WHERE institution_key=$1 AND status='ACTIVE') AS active_branches,
           (SELECT COUNT(*)::int FROM admin_roles WHERE institution_key=$1 AND status='ACTIVE') AS active_roles,
           (SELECT COUNT(*)::int FROM admin_user_assignments WHERE institution_key=$1 AND status='ACTIVE') AS active_assignments,
           (SELECT COUNT(*)::int FROM admin_loan_products WHERE institution_key=$1 AND status='ACTIVE') AS active_products,
           (SELECT COUNT(*)::int FROM admin_workflows WHERE institution_key=$1 AND status='ACTIVE') AS active_workflows`,
        [operator.institutionKey],
      ),
    ]);
    return { branches: branches.rows, roles: roles.rows, assignments: assignments.rows, products: products.rows, workflows: workflows.rows, settings: settings.rows, summary: summary.rows[0] };
  });
}

export async function createBranch(input: { operator: AdministrationOperator; branchCode: string; branchName: string; timezone?: string; address?: Record<string,unknown> }) {
  if (!input.branchCode.trim() || !input.branchName.trim()) throw new Error("ADMIN_BRANCH_FIELDS_REQUIRED");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const id = randomUUID();
    await client.query(
      `INSERT INTO admin_branches (branch_id,institution_key,branch_code,branch_name,timezone,address,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$7)`,
      [id,input.operator.institutionKey,input.branchCode.trim().toUpperCase(),input.branchName.trim(),input.timezone?.trim() || "America/Denver",JSON.stringify(input.address || {}),input.operator.userId],
    );
    await recordEvent(client,input.operator,"BRANCH",id,"BRANCH_CREATED",{ branchCode: input.branchCode.trim().toUpperCase() });
    return { branchId: id, status: "ACTIVE" };
  });
}

export async function createRole(input: { operator: AdministrationOperator; roleCode: string; roleName: string; description?: string; permissions?: string[]; approvalLimit?: number }) {
  if (!input.roleCode.trim() || !input.roleName.trim()) throw new Error("ADMIN_ROLE_FIELDS_REQUIRED");
  const approvalLimit = input.approvalLimit === undefined ? null : Number(input.approvalLimit);
  if (approvalLimit !== null && (!Number.isFinite(approvalLimit) || approvalLimit < 0)) throw new Error("ADMIN_APPROVAL_LIMIT_INVALID");
  const permissions = [...new Set((input.permissions || []).map((value) => value.trim()).filter(Boolean))];
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const id = randomUUID();
    await client.query(
      `INSERT INTO admin_roles (role_id,institution_key,role_code,role_name,description,permissions,approval_limit,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$8)`,
      [id,input.operator.institutionKey,input.roleCode.trim().toUpperCase(),input.roleName.trim(),input.description?.trim() || null,JSON.stringify(permissions),approvalLimit,input.operator.userId],
    );
    await recordEvent(client,input.operator,"ROLE",id,"ROLE_CREATED",{ roleCode: input.roleCode.trim().toUpperCase(), permissions });
    return { roleId: id, status: "ACTIVE" };
  });
}

export async function assignUserRole(input: { operator: AdministrationOperator; userId: string; roleId: string; branchId?: string; effectiveFrom?: string; effectiveTo?: string }) {
  if (!input.userId.trim() || !input.roleId) throw new Error("ADMIN_ASSIGNMENT_FIELDS_REQUIRED");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const role = await client.query(`SELECT role_id FROM admin_roles WHERE institution_key=$1 AND role_id=$2 AND status='ACTIVE'`,[input.operator.institutionKey,input.roleId]);
    if (!role.rows[0]) throw new Error("ADMIN_ROLE_NOT_FOUND");
    if (input.branchId) {
      const branch = await client.query(`SELECT branch_id FROM admin_branches WHERE institution_key=$1 AND branch_id=$2 AND status='ACTIVE'`,[input.operator.institutionKey,input.branchId]);
      if (!branch.rows[0]) throw new Error("ADMIN_BRANCH_NOT_FOUND");
    }
    const id = randomUUID();
    await client.query(
      `INSERT INTO admin_user_assignments (assignment_id,institution_key,user_id,role_id,branch_id,effective_from,effective_to,assigned_by)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6::date,CURRENT_DATE),$7::date,$8)`,
      [id,input.operator.institutionKey,input.userId.trim(),input.roleId,input.branchId || null,input.effectiveFrom || null,input.effectiveTo || null,input.operator.userId],
    );
    await recordEvent(client,input.operator,"ASSIGNMENT",id,"ROLE_ASSIGNED",{ userId: input.userId.trim(), roleId: input.roleId, branchId: input.branchId || null });
    return { assignmentId: id, status: "ACTIVE" };
  });
}

export async function createLoanProduct(input: { operator: AdministrationOperator; productCode: string; productName: string; minAmount?: number; maxAmount?: number; minRate?: number; maxRate?: number; minTermMonths?: number; maxTermMonths?: number; feeSchedule?: Record<string,unknown>; policyRules?: Record<string,unknown> }) {
  if (!input.productCode.trim() || !input.productName.trim()) throw new Error("ADMIN_PRODUCT_FIELDS_REQUIRED");
  const numeric = [input.minAmount,input.maxAmount,input.minRate,input.maxRate,input.minTermMonths,input.maxTermMonths].filter((v) => v !== undefined);
  if (numeric.some((v) => !Number.isFinite(Number(v)) || Number(v) < 0)) throw new Error("ADMIN_PRODUCT_VALUES_INVALID");
  if (input.minAmount !== undefined && input.maxAmount !== undefined && input.minAmount > input.maxAmount) throw new Error("ADMIN_PRODUCT_AMOUNT_RANGE_INVALID");
  if (input.minRate !== undefined && input.maxRate !== undefined && input.minRate > input.maxRate) throw new Error("ADMIN_PRODUCT_RATE_RANGE_INVALID");
  if (input.minTermMonths !== undefined && input.maxTermMonths !== undefined && input.minTermMonths > input.maxTermMonths) throw new Error("ADMIN_PRODUCT_TERM_RANGE_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const id = randomUUID();
    await client.query(
      `INSERT INTO admin_loan_products (loan_product_id,institution_key,product_code,product_name,min_amount,max_amount,min_rate,max_rate,min_term_months,max_term_months,fee_schedule,policy_rules,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$13)`,
      [id,input.operator.institutionKey,input.productCode.trim().toUpperCase(),input.productName.trim(),input.minAmount ?? null,input.maxAmount ?? null,input.minRate ?? null,input.maxRate ?? null,input.minTermMonths ?? null,input.maxTermMonths ?? null,JSON.stringify(input.feeSchedule || {}),JSON.stringify(input.policyRules || {}),input.operator.userId],
    );
    await recordEvent(client,input.operator,"PRODUCT",id,"PRODUCT_CREATED",{ productCode: input.productCode.trim().toUpperCase() });
    return { loanProductId: id, status: "DRAFT" };
  });
}

export async function createWorkflow(input: { operator: AdministrationOperator; workflowCode: string; workflowName: string; module: string; definition?: Record<string,unknown> }) {
  if (!input.workflowCode.trim() || !input.workflowName.trim() || !input.module.trim()) throw new Error("ADMIN_WORKFLOW_FIELDS_REQUIRED");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const id = randomUUID();
    await client.query(
      `INSERT INTO admin_workflows (workflow_id,institution_key,workflow_code,workflow_name,module,definition,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$7)`,
      [id,input.operator.institutionKey,input.workflowCode.trim().toUpperCase(),input.workflowName.trim(),input.module.trim().toUpperCase(),JSON.stringify(input.definition || {}),input.operator.userId],
    );
    await recordEvent(client,input.operator,"WORKFLOW",id,"WORKFLOW_CREATED",{ workflowCode: input.workflowCode.trim().toUpperCase(), module: input.module.trim().toUpperCase() });
    return { workflowId: id, status: "DRAFT" };
  });
}

export async function upsertSetting(input: { operator: AdministrationOperator; settingKey: string; settingValue: unknown; description?: string; isSensitive?: boolean }) {
  if (!input.settingKey.trim()) throw new Error("ADMIN_SETTING_KEY_REQUIRED");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const id = randomUUID();
    const result = await client.query<{ setting_id: string }>(
      `INSERT INTO admin_settings (setting_id,institution_key,setting_key,setting_value,description,is_sensitive,updated_by)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7)
       ON CONFLICT (institution_key,setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,description=EXCLUDED.description,is_sensitive=EXCLUDED.is_sensitive,updated_by=EXCLUDED.updated_by,updated_at=NOW()
       RETURNING setting_id`,
      [id,input.operator.institutionKey,input.settingKey.trim(),JSON.stringify(input.settingValue),input.description?.trim() || null,Boolean(input.isSensitive),input.operator.userId],
    );
    const settingId = result.rows[0].setting_id;
    await recordEvent(client,input.operator,"SETTING",settingId,"SETTING_UPSERTED",{ settingKey: input.settingKey.trim(), isSensitive: Boolean(input.isSensitive) });
    return { settingId, settingKey: input.settingKey.trim() };
  });
}

export async function updateAdministrationItem(input: { operator: AdministrationOperator; itemType: string; itemId: string; action: string }) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const maps: Record<string,{ table: string; idColumn: string; statuses: Set<string> }> = {
      BRANCH: { table: "admin_branches", idColumn: "branch_id", statuses: branchStatuses },
      ROLE: { table: "admin_roles", idColumn: "role_id", statuses: roleStatuses },
      PRODUCT: { table: "admin_loan_products", idColumn: "loan_product_id", statuses: productStatuses },
      WORKFLOW: { table: "admin_workflows", idColumn: "workflow_id", statuses: workflowStatuses },
    };
    const target = maps[input.itemType];
    if (!target || !target.statuses.has(input.action)) throw new Error("ADMIN_ACTION_INVALID");
    const result = await client.query(
      `UPDATE ${target.table} SET status=$3,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND ${target.idColumn}=$2 RETURNING ${target.idColumn}`,
      [input.operator.institutionKey,input.itemId,input.action,input.operator.userId],
    );
    if (!result.rows[0]) throw new Error("ADMIN_ITEM_NOT_FOUND");
    await recordEvent(client,input.operator,input.itemType,input.itemId,`${input.itemType}_${input.action}`,{});
    return { status: input.action };
  });
}

async function recordEvent(client: { query: (text: string, values?: unknown[]) => Promise<unknown> },operator: AdministrationOperator,entityType: string,entityId: string,eventType: string,eventData: Record<string,unknown>) {
  await client.query(
    `INSERT INTO admin_events (admin_event_id,institution_key,entity_type,entity_id,event_type,actor_user_id,event_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [randomUUID(),operator.institutionKey,entityType,entityId,eventType,operator.userId,JSON.stringify(eventData)],
  );
}
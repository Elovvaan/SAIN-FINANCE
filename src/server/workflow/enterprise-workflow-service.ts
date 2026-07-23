import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

export type WorkflowOperator = { institutionKey: string; userId: string };

const categories = new Set(["LENDING","SERVICING","TREASURY","COMPLIANCE","RISK","CUSTOMER","OPERATIONS","ADMINISTRATION"]);
const triggerTypes = new Set(["MANUAL","EVENT","SCHEDULE","RULE"]);
const stepTypes = new Set(["TASK","APPROVAL","AUTOMATION","NOTIFICATION","WAIT","DECISION"]);
const priorities = new Set(["LOW","NORMAL","HIGH","URGENT"]);

export async function listWorkflowWorkspace(operator: WorkflowOperator, query = "") {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const [definitions, instances, tasks, approvals, summary] = await Promise.all([
      client.query(
        `SELECT workflow_definition_id,workflow_code,workflow_name,category,status,version,trigger_type,updated_at
         FROM workflow_definitions
         WHERE institution_key=$1
           AND ($2='' OR to_tsvector('english',workflow_code||' '||workflow_name||' '||category) @@ plainto_tsquery('english',$2))
         ORDER BY category,workflow_name,version DESC
         LIMIT 300`,
        [operator.institutionKey,query.trim()],
      ),
      client.query(
        `SELECT i.workflow_instance_id,i.status,i.current_step_code,i.priority,i.related_entity_type,i.related_entity_id,i.started_at,i.updated_at,
                d.workflow_code,d.workflow_name
         FROM workflow_instances i
         JOIN workflow_definitions d ON d.workflow_definition_id=i.workflow_definition_id AND d.institution_key=i.institution_key
         WHERE i.institution_key=$1
         ORDER BY CASE i.status WHEN 'RUNNING' THEN 1 WHEN 'PENDING' THEN 2 WHEN 'PAUSED' THEN 3 ELSE 4 END,i.updated_at DESC
         LIMIT 300`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT t.workflow_task_id,t.task_name,t.task_type,t.step_code,t.status,t.assigned_user_id,t.assigned_role,t.due_at,t.created_at,
                i.workflow_instance_id,d.workflow_name
         FROM workflow_tasks t
         JOIN workflow_instances i ON i.workflow_instance_id=t.workflow_instance_id AND i.institution_key=t.institution_key
         JOIN workflow_definitions d ON d.workflow_definition_id=i.workflow_definition_id AND d.institution_key=i.institution_key
         WHERE t.institution_key=$1
         ORDER BY CASE t.status WHEN 'OPEN' THEN 1 WHEN 'IN_PROGRESS' THEN 2 ELSE 3 END,t.due_at NULLS LAST,t.created_at DESC
         LIMIT 300`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT a.workflow_approval_id,a.approval_status,a.approver_user_id,a.approver_role,a.requested_at,a.decided_at,
                t.workflow_task_id,t.task_name,i.workflow_instance_id,d.workflow_name
         FROM workflow_approvals a
         JOIN workflow_tasks t ON t.workflow_task_id=a.workflow_task_id AND t.institution_key=a.institution_key
         JOIN workflow_instances i ON i.workflow_instance_id=t.workflow_instance_id AND i.institution_key=t.institution_key
         JOIN workflow_definitions d ON d.workflow_definition_id=i.workflow_definition_id AND d.institution_key=i.institution_key
         WHERE a.institution_key=$1
         ORDER BY CASE a.approval_status WHEN 'PENDING' THEN 1 ELSE 2 END,a.requested_at DESC
         LIMIT 200`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT
           (SELECT COUNT(*)::int FROM workflow_definitions WHERE institution_key=$1 AND status='ACTIVE') AS active_definitions,
           (SELECT COUNT(*)::int FROM workflow_instances WHERE institution_key=$1 AND status IN ('PENDING','RUNNING','PAUSED')) AS active_instances,
           (SELECT COUNT(*)::int FROM workflow_tasks WHERE institution_key=$1 AND status IN ('OPEN','IN_PROGRESS')) AS open_tasks,
           (SELECT COUNT(*)::int FROM workflow_tasks WHERE institution_key=$1 AND status IN ('OPEN','IN_PROGRESS') AND due_at<NOW()) AS overdue_tasks,
           (SELECT COUNT(*)::int FROM workflow_approvals WHERE institution_key=$1 AND approval_status='PENDING') AS pending_approvals`,
        [operator.institutionKey],
      ),
    ]);

    return {
      definitions: definitions.rows,
      instances: instances.rows,
      tasks: tasks.rows,
      approvals: approvals.rows,
      summary: summary.rows[0],
    };
  });
}

export async function createWorkflowDefinition(input: {
  operator: WorkflowOperator;
  workflowCode: string;
  workflowName: string;
  category: string;
  description?: string;
  triggerType?: string;
  triggerConfig?: Record<string, unknown>;
}) {
  if (!input.workflowCode.trim() || !input.workflowName.trim()) throw new Error("WORKFLOW_DEFINITION_FIELDS_REQUIRED");
  if (!categories.has(input.category)) throw new Error("WORKFLOW_CATEGORY_INVALID");
  const triggerType = input.triggerType || "MANUAL";
  if (!triggerTypes.has(triggerType)) throw new Error("WORKFLOW_TRIGGER_INVALID");

  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const workflowDefinitionId = randomUUID();
    await client.query(
      `INSERT INTO workflow_definitions
       (workflow_definition_id,institution_key,workflow_code,workflow_name,category,description,trigger_type,trigger_config,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$9)`,
      [workflowDefinitionId,input.operator.institutionKey,input.workflowCode.trim().toUpperCase(),input.workflowName.trim(),input.category,input.description?.trim() || null,triggerType,JSON.stringify(input.triggerConfig || {}),input.operator.userId],
    );
    await recordEvent(client,input.operator,null,"WORKFLOW_DEFINITION",workflowDefinitionId,"WORKFLOW_DEFINITION_CREATED",{ category: input.category, triggerType });
    return { workflowDefinitionId,status: "DRAFT" };
  });
}

export async function addWorkflowStep(input: {
  operator: WorkflowOperator;
  workflowDefinitionId: string;
  stepCode: string;
  stepName: string;
  stepType: string;
  sequenceNumber: number;
  assignedRole?: string;
  configuration?: Record<string, unknown>;
  slaMinutes?: number;
  isRequired?: boolean;
}) {
  if (!input.workflowDefinitionId || !input.stepCode.trim() || !input.stepName.trim()) throw new Error("WORKFLOW_STEP_FIELDS_REQUIRED");
  if (!stepTypes.has(input.stepType)) throw new Error("WORKFLOW_STEP_TYPE_INVALID");
  if (!Number.isInteger(input.sequenceNumber) || input.sequenceNumber < 1) throw new Error("WORKFLOW_STEP_SEQUENCE_INVALID");

  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const definition = await client.query(
      `SELECT workflow_definition_id FROM workflow_definitions WHERE institution_key=$1 AND workflow_definition_id=$2`,
      [input.operator.institutionKey,input.workflowDefinitionId],
    );
    if (!definition.rows[0]) throw new Error("WORKFLOW_DEFINITION_NOT_FOUND");

    const workflowStepId = randomUUID();
    await client.query(
      `INSERT INTO workflow_steps
       (workflow_step_id,institution_key,workflow_definition_id,step_code,step_name,step_type,sequence_number,assigned_role,configuration,sla_minutes,is_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,
      [workflowStepId,input.operator.institutionKey,input.workflowDefinitionId,input.stepCode.trim().toUpperCase(),input.stepName.trim(),input.stepType,input.sequenceNumber,input.assignedRole?.trim() || null,JSON.stringify(input.configuration || {}),input.slaMinutes ?? null,input.isRequired ?? true],
    );
    await recordEvent(client,input.operator,null,"WORKFLOW_STEP",workflowStepId,"WORKFLOW_STEP_CREATED",{ workflowDefinitionId: input.workflowDefinitionId, stepType: input.stepType });
    return { workflowStepId };
  });
}

export async function startWorkflowInstance(input: {
  operator: WorkflowOperator;
  workflowDefinitionId: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  priority?: string;
  context?: Record<string, unknown>;
}) {
  if (!input.workflowDefinitionId) throw new Error("WORKFLOW_DEFINITION_REQUIRED");
  const priority = input.priority || "NORMAL";
  if (!priorities.has(priority)) throw new Error("WORKFLOW_PRIORITY_INVALID");

  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const definition = await client.query(
      `SELECT workflow_definition_id,version,status FROM workflow_definitions WHERE institution_key=$1 AND workflow_definition_id=$2`,
      [input.operator.institutionKey,input.workflowDefinitionId],
    );
    if (!definition.rows[0]) throw new Error("WORKFLOW_DEFINITION_NOT_FOUND");
    if (definition.rows[0].status !== "ACTIVE") throw new Error("WORKFLOW_DEFINITION_NOT_ACTIVE");

    const firstStep = await client.query(
      `SELECT workflow_step_id,step_code,step_name,step_type,assigned_role,sla_minutes
       FROM workflow_steps
       WHERE institution_key=$1 AND workflow_definition_id=$2
       ORDER BY sequence_number ASC LIMIT 1`,
      [input.operator.institutionKey,input.workflowDefinitionId],
    );

    const workflowInstanceId = randomUUID();
    const firstStepCode = firstStep.rows[0]?.step_code || null;
    await client.query(
      `INSERT INTO workflow_instances
       (workflow_instance_id,institution_key,workflow_definition_id,workflow_version,related_entity_type,related_entity_id,status,current_step_code,priority,context,started_by)
       VALUES ($1,$2,$3,$4,$5,$6,'RUNNING',$7,$8,$9::jsonb,$10)`,
      [workflowInstanceId,input.operator.institutionKey,input.workflowDefinitionId,definition.rows[0].version,input.relatedEntityType?.trim() || null,input.relatedEntityId?.trim() || null,firstStepCode,priority,JSON.stringify(input.context || {}),input.operator.userId],
    );

    let workflowTaskId: string | null = null;
    if (firstStep.rows[0]) {
      workflowTaskId = randomUUID();
      await client.query(
        `INSERT INTO workflow_tasks
         (workflow_task_id,institution_key,workflow_instance_id,workflow_step_id,step_code,task_name,task_type,status,assigned_role,due_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'OPEN',$8,CASE WHEN $9::int IS NULL THEN NULL ELSE NOW()+($9||' minutes')::interval END)`,
        [workflowTaskId,input.operator.institutionKey,workflowInstanceId,firstStep.rows[0].workflow_step_id,firstStep.rows[0].step_code,firstStep.rows[0].step_name,firstStep.rows[0].step_type,firstStep.rows[0].assigned_role,firstStep.rows[0].sla_minutes],
      );
    }

    await recordEvent(client,input.operator,workflowInstanceId,"WORKFLOW_INSTANCE",workflowInstanceId,"WORKFLOW_INSTANCE_STARTED",{ firstStepCode, priority });
    return { workflowInstanceId,workflowTaskId,status: "RUNNING",currentStepCode: firstStepCode };
  });
}

export async function updateWorkflowItem(input: {
  operator: WorkflowOperator;
  itemType: string;
  itemId: string;
  action: string;
  note?: string;
}) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    if (input.itemType === "DEFINITION") {
      const statusByAction: Record<string,string> = { ACTIVATE: "ACTIVE", RETIRE: "RETIRED", DRAFT: "DRAFT" };
      const status = statusByAction[input.action];
      if (!status) throw new Error("WORKFLOW_ACTION_INVALID");
      const result = await client.query(
        `UPDATE workflow_definitions SET status=$3,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND workflow_definition_id=$2 RETURNING workflow_definition_id`,
        [input.operator.institutionKey,input.itemId,status,input.operator.userId],
      );
      if (!result.rows[0]) throw new Error("WORKFLOW_DEFINITION_NOT_FOUND");
      await recordEvent(client,input.operator,null,"WORKFLOW_DEFINITION",input.itemId,`WORKFLOW_DEFINITION_${status}`,{});
      return { status };
    }

    if (input.itemType === "INSTANCE") {
      const statusByAction: Record<string,string> = { PAUSE: "PAUSED", RESUME: "RUNNING", COMPLETE: "COMPLETED", CANCEL: "CANCELLED", FAIL: "FAILED" };
      const status = statusByAction[input.action];
      if (!status) throw new Error("WORKFLOW_ACTION_INVALID");
      const result = await client.query(
        `UPDATE workflow_instances
         SET status=$3,completed_at=CASE WHEN $3='COMPLETED' THEN NOW() ELSE completed_at END,cancelled_at=CASE WHEN $3='CANCELLED' THEN NOW() ELSE cancelled_at END,updated_at=NOW()
         WHERE institution_key=$1 AND workflow_instance_id=$2 RETURNING workflow_instance_id`,
        [input.operator.institutionKey,input.itemId,status],
      );
      if (!result.rows[0]) throw new Error("WORKFLOW_INSTANCE_NOT_FOUND");
      await recordEvent(client,input.operator,input.itemId,"WORKFLOW_INSTANCE",input.itemId,`WORKFLOW_INSTANCE_${status}`,{ note: input.note || null });
      return { status };
    }

    if (input.itemType === "TASK") {
      const statusByAction: Record<string,string> = { START: "IN_PROGRESS", COMPLETE: "COMPLETED", SKIP: "SKIPPED", FAIL: "FAILED", REOPEN: "OPEN" };
      const status = statusByAction[input.action];
      if (!status) throw new Error("WORKFLOW_ACTION_INVALID");
      const result = await client.query(
        `UPDATE workflow_tasks
         SET status=$3,started_at=CASE WHEN $3='IN_PROGRESS' THEN NOW() ELSE started_at END,completed_at=CASE WHEN $3 IN ('COMPLETED','SKIPPED','FAILED') THEN NOW() ELSE completed_at END,updated_at=NOW()
         WHERE institution_key=$1 AND workflow_task_id=$2 RETURNING workflow_task_id,workflow_instance_id`,
        [input.operator.institutionKey,input.itemId,status],
      );
      if (!result.rows[0]) throw new Error("WORKFLOW_TASK_NOT_FOUND");
      await recordEvent(client,input.operator,result.rows[0].workflow_instance_id,"WORKFLOW_TASK",input.itemId,`WORKFLOW_TASK_${status}`,{ note: input.note || null });
      return { status };
    }

    if (input.itemType === "APPROVAL") {
      const statusByAction: Record<string,string> = { APPROVE: "APPROVED", REJECT: "REJECTED" };
      const status = statusByAction[input.action];
      if (!status) throw new Error("WORKFLOW_ACTION_INVALID");
      const result = await client.query(
        `UPDATE workflow_approvals
         SET approval_status=$3,approver_user_id=$4,decision_reason=$5,decided_at=NOW()
         WHERE institution_key=$1 AND workflow_approval_id=$2 RETURNING workflow_approval_id,workflow_task_id`,
        [input.operator.institutionKey,input.itemId,status,input.operator.userId,input.note?.trim() || null],
      );
      if (!result.rows[0]) throw new Error("WORKFLOW_APPROVAL_NOT_FOUND");
      await recordEvent(client,input.operator,null,"WORKFLOW_APPROVAL",input.itemId,`WORKFLOW_APPROVAL_${status}`,{ workflowTaskId: result.rows[0].workflow_task_id });
      return { status };
    }

    throw new Error("WORKFLOW_ITEM_TYPE_INVALID");
  });
}

async function recordEvent(
  client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  operator: WorkflowOperator,
  workflowInstanceId: string | null,
  entityType: string,
  entityId: string,
  eventType: string,
  eventData: Record<string, unknown>,
) {
  await client.query(
    `INSERT INTO workflow_events
     (workflow_event_id,institution_key,workflow_instance_id,entity_type,entity_id,event_type,event_data,actor_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
    [randomUUID(),operator.institutionKey,workflowInstanceId,entityType,entityId,eventType,JSON.stringify(eventData),operator.userId],
  );
}
import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

export type IntelligenceOperator = { institutionKey: string; userId: string };

const assistantTypes = new Set(["UNDERWRITING","COMPLIANCE","CREDIT","DOCUMENT","FRAUD","EXECUTIVE","OPERATIONS"]);
const priorities = new Set(["LOW","NORMAL","HIGH","CRITICAL"]);
const sourceTypes = new Set(["DOCUMENT_REPOSITORY","POLICY_LIBRARY","DATABASE_VIEW","EXTERNAL_REFERENCE","PROCEDURE"]);

async function recordEvent(client: { query: (text: string, values?: unknown[]) => Promise<unknown> }, operator: IntelligenceOperator, entityType: string, entityId: string, eventType: string, eventData: Record<string, unknown>) {
  await client.query(
    `INSERT INTO intelligence_events (intelligence_event_id,institution_key,entity_type,entity_id,event_type,actor_user_id,event_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [randomUUID(),operator.institutionKey,entityType,entityId,eventType,operator.userId,JSON.stringify(eventData)],
  );
}

export async function listIntelligenceWorkspace(operator: IntelligenceOperator) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const [models, prompts, sources, conversations, tasks, recommendations, summary] = await Promise.all([
      client.query(`SELECT model_config_id,config_code,config_name,provider,model_name,status,capabilities,updated_at FROM intelligence_model_configs WHERE institution_key=$1 ORDER BY status,config_name`,[operator.institutionKey]),
      client.query(`SELECT prompt_template_id,template_code,template_name,assistant_type,version,status,updated_at FROM intelligence_prompt_templates WHERE institution_key=$1 ORDER BY assistant_type,template_name,version DESC`,[operator.institutionKey]),
      client.query(`SELECT knowledge_source_id,source_code,source_name,source_type,status,last_indexed_at,updated_at FROM intelligence_knowledge_sources WHERE institution_key=$1 ORDER BY source_type,source_name`,[operator.institutionKey]),
      client.query(`SELECT conversation_id,assistant_type,title,status,context_entity_type,context_entity_id,updated_at FROM intelligence_conversations WHERE institution_key=$1 ORDER BY updated_at DESC LIMIT 100`,[operator.institutionKey]),
      client.query(`SELECT intelligence_task_id,task_type,assistant_type,status,priority,source_entity_type,source_entity_id,confidence_score,explanation,created_at,completed_at FROM intelligence_tasks WHERE institution_key=$1 ORDER BY CASE priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END,created_at DESC LIMIT 200`,[operator.institutionKey]),
      client.query(`SELECT recommendation_id,recommendation_type,title,recommendation,status,severity,confidence_score,source_entity_type,source_entity_id,created_at,resolved_at FROM intelligence_recommendations WHERE institution_key=$1 ORDER BY CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,created_at DESC LIMIT 200`,[operator.institutionKey]),
      client.query(`SELECT
        (SELECT COUNT(*)::int FROM intelligence_model_configs WHERE institution_key=$1 AND status='ACTIVE') AS active_models,
        (SELECT COUNT(*)::int FROM intelligence_tasks WHERE institution_key=$1 AND status IN ('QUEUED','PROCESSING')) AS active_tasks,
        (SELECT COUNT(*)::int FROM intelligence_tasks WHERE institution_key=$1 AND status='REVIEW_REQUIRED') AS review_required,
        (SELECT COUNT(*)::int FROM intelligence_recommendations WHERE institution_key=$1 AND status='OPEN') AS open_recommendations,
        (SELECT COUNT(*)::int FROM intelligence_knowledge_sources WHERE institution_key=$1 AND status='FAILED') AS failed_sources`,[operator.institutionKey]),
    ]);
    return { models: models.rows, prompts: prompts.rows, sources: sources.rows, conversations: conversations.rows, tasks: tasks.rows, recommendations: recommendations.rows, summary: summary.rows[0] };
  });
}

export async function createModelConfig(input: { operator: IntelligenceOperator; configCode: string; configName: string; provider: string; modelName: string; capabilities?: string[]; credentialReference?: string }) {
  if (!input.configCode.trim() || !input.configName.trim() || !input.provider.trim() || !input.modelName.trim()) throw new Error("INTELLIGENCE_MODEL_FIELDS_REQUIRED");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const id = randomUUID();
    await client.query(`INSERT INTO intelligence_model_configs (model_config_id,institution_key,config_code,config_name,provider,model_name,capabilities,credential_reference,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$9)`,[id,input.operator.institutionKey,input.configCode.trim().toUpperCase(),input.configName.trim(),input.provider.trim(),input.modelName.trim(),JSON.stringify(input.capabilities || []),input.credentialReference?.trim() || null,input.operator.userId]);
    await recordEvent(client,input.operator,"MODEL_CONFIG",id,"MODEL_CONFIG_CREATED",{ provider: input.provider, modelName: input.modelName });
    return { modelConfigId: id, status: "INACTIVE" };
  });
}

export async function createPromptTemplate(input: { operator: IntelligenceOperator; templateCode: string; templateName: string; assistantType: string; systemInstructions: string }) {
  if (!assistantTypes.has(input.assistantType)) throw new Error("INTELLIGENCE_ASSISTANT_TYPE_INVALID");
  if (!input.templateCode.trim() || !input.templateName.trim() || !input.systemInstructions.trim()) throw new Error("INTELLIGENCE_PROMPT_FIELDS_REQUIRED");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const id = randomUUID();
    await client.query(`INSERT INTO intelligence_prompt_templates (prompt_template_id,institution_key,template_code,template_name,assistant_type,system_instructions,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,[id,input.operator.institutionKey,input.templateCode.trim().toUpperCase(),input.templateName.trim(),input.assistantType,input.systemInstructions.trim(),input.operator.userId]);
    await recordEvent(client,input.operator,"PROMPT_TEMPLATE",id,"PROMPT_TEMPLATE_CREATED",{ assistantType: input.assistantType });
    return { promptTemplateId: id, status: "DRAFT" };
  });
}

export async function createKnowledgeSource(input: { operator: IntelligenceOperator; sourceCode: string; sourceName: string; sourceType: string; sourceReference: string }) {
  if (!sourceTypes.has(input.sourceType)) throw new Error("INTELLIGENCE_SOURCE_TYPE_INVALID");
  if (!input.sourceCode.trim() || !input.sourceName.trim() || !input.sourceReference.trim()) throw new Error("INTELLIGENCE_SOURCE_FIELDS_REQUIRED");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const id = randomUUID();
    await client.query(`INSERT INTO intelligence_knowledge_sources (knowledge_source_id,institution_key,source_code,source_name,source_type,source_reference,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,[id,input.operator.institutionKey,input.sourceCode.trim().toUpperCase(),input.sourceName.trim(),input.sourceType,input.sourceReference.trim(),input.operator.userId]);
    await recordEvent(client,input.operator,"KNOWLEDGE_SOURCE",id,"KNOWLEDGE_SOURCE_CREATED",{ sourceType: input.sourceType });
    return { knowledgeSourceId: id, status: "ACTIVE" };
  });
}

export async function createConversation(input: { operator: IntelligenceOperator; assistantType: string; title: string; contextEntityType?: string; contextEntityId?: string; message?: string }) {
  if (!assistantTypes.has(input.assistantType)) throw new Error("INTELLIGENCE_ASSISTANT_TYPE_INVALID");
  if (!input.title.trim()) throw new Error("INTELLIGENCE_CONVERSATION_TITLE_REQUIRED");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const id = randomUUID();
    await client.query(`INSERT INTO intelligence_conversations (conversation_id,institution_key,assistant_type,title,context_entity_type,context_entity_id,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,[id,input.operator.institutionKey,input.assistantType,input.title.trim(),input.contextEntityType?.trim() || null,input.contextEntityId?.trim() || null,input.operator.userId]);
    if (input.message?.trim()) await client.query(`INSERT INTO intelligence_messages (message_id,institution_key,conversation_id,role,content,created_by) VALUES ($1,$2,$3,'USER',$4,$5)`,[randomUUID(),input.operator.institutionKey,id,input.message.trim(),input.operator.userId]);
    await recordEvent(client,input.operator,"CONVERSATION",id,"CONVERSATION_CREATED",{ assistantType: input.assistantType });
    return { conversationId: id, status: "OPEN" };
  });
}

export async function createIntelligenceTask(input: { operator: IntelligenceOperator; taskType: string; assistantType: string; priority: string; sourceEntityType?: string; sourceEntityId?: string; inputData?: Record<string, unknown> }) {
  if (!assistantTypes.has(input.assistantType)) throw new Error("INTELLIGENCE_ASSISTANT_TYPE_INVALID");
  if (!priorities.has(input.priority)) throw new Error("INTELLIGENCE_PRIORITY_INVALID");
  if (!input.taskType.trim()) throw new Error("INTELLIGENCE_TASK_TYPE_REQUIRED");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const id = randomUUID();
    await client.query(`INSERT INTO intelligence_tasks (intelligence_task_id,institution_key,task_type,assistant_type,priority,source_entity_type,source_entity_id,input_data,requested_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,[id,input.operator.institutionKey,input.taskType.trim().toUpperCase(),input.assistantType,input.priority,input.sourceEntityType?.trim() || null,input.sourceEntityId?.trim() || null,JSON.stringify(input.inputData || {}),input.operator.userId]);
    await recordEvent(client,input.operator,"TASK",id,"TASK_QUEUED",{ taskType: input.taskType.trim().toUpperCase(), priority: input.priority });
    return { intelligenceTaskId: id, status: "QUEUED" };
  });
}

export async function createRecommendation(input: { operator: IntelligenceOperator; recommendationType: string; title: string; recommendation: string; severity: string; confidenceScore?: number; sourceEntityType?: string; sourceEntityId?: string }) {
  if (!new Set(["LOW","MEDIUM","HIGH","CRITICAL"]).has(input.severity)) throw new Error("INTELLIGENCE_SEVERITY_INVALID");
  if (!input.recommendationType.trim() || !input.title.trim() || !input.recommendation.trim()) throw new Error("INTELLIGENCE_RECOMMENDATION_FIELDS_REQUIRED");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const id = randomUUID();
    await client.query(`INSERT INTO intelligence_recommendations (recommendation_id,institution_key,recommendation_type,title,recommendation,severity,confidence_score,source_entity_type,source_entity_id,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,input.operator.institutionKey,input.recommendationType.trim().toUpperCase(),input.title.trim(),input.recommendation.trim(),input.severity,input.confidenceScore ?? null,input.sourceEntityType?.trim() || null,input.sourceEntityId?.trim() || null,input.operator.userId]);
    await recordEvent(client,input.operator,"RECOMMENDATION",id,"RECOMMENDATION_CREATED",{ severity: input.severity });
    return { recommendationId: id, status: "OPEN" };
  });
}

export async function updateIntelligenceItem(input: { operator: IntelligenceOperator; itemType: string; itemId: string; action: string; explanation?: string; confidenceScore?: number }) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    if (input.itemType === "MODEL") {
      const status = ({ ACTIVATE: "ACTIVE", DEACTIVATE: "INACTIVE", DEGRADE: "DEGRADED", RETIRE: "RETIRED" } as Record<string,string>)[input.action];
      if (!status) throw new Error("INTELLIGENCE_ACTION_INVALID");
      const result = await client.query(`UPDATE intelligence_model_configs SET status=$3,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND model_config_id=$2 RETURNING model_config_id`,[input.operator.institutionKey,input.itemId,status,input.operator.userId]);
      if (!result.rows[0]) throw new Error("INTELLIGENCE_MODEL_NOT_FOUND");
      await recordEvent(client,input.operator,"MODEL_CONFIG",input.itemId,`MODEL_${status}`,{});
      return { status };
    }
    if (input.itemType === "PROMPT") {
      const status = ({ ACTIVATE: "ACTIVE", DEACTIVATE: "INACTIVE", RETIRE: "RETIRED" } as Record<string,string>)[input.action];
      if (!status) throw new Error("INTELLIGENCE_ACTION_INVALID");
      const result = await client.query(`UPDATE intelligence_prompt_templates SET status=$3,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND prompt_template_id=$2 RETURNING prompt_template_id`,[input.operator.institutionKey,input.itemId,status,input.operator.userId]);
      if (!result.rows[0]) throw new Error("INTELLIGENCE_PROMPT_NOT_FOUND");
      await recordEvent(client,input.operator,"PROMPT_TEMPLATE",input.itemId,`PROMPT_${status}`,{});
      return { status };
    }
    if (input.itemType === "SOURCE") {
      const status = ({ ACTIVATE: "ACTIVE", DEACTIVATE: "INACTIVE", INDEX: "INDEXING", FAIL: "FAILED", COMPLETE: "ACTIVE" } as Record<string,string>)[input.action];
      if (!status) throw new Error("INTELLIGENCE_ACTION_INVALID");
      const result = await client.query(`UPDATE intelligence_knowledge_sources SET status=$3,last_indexed_at=CASE WHEN $4='COMPLETE' THEN NOW() ELSE last_indexed_at END,updated_by=$5,updated_at=NOW() WHERE institution_key=$1 AND knowledge_source_id=$2 RETURNING knowledge_source_id`,[input.operator.institutionKey,input.itemId,status,input.action,input.operator.userId]);
      if (!result.rows[0]) throw new Error("INTELLIGENCE_SOURCE_NOT_FOUND");
      await recordEvent(client,input.operator,"KNOWLEDGE_SOURCE",input.itemId,`SOURCE_${status}`,{});
      return { status };
    }
    if (input.itemType === "TASK") {
      const status = ({ START: "PROCESSING", COMPLETE: "COMPLETED", REVIEW: "REVIEW_REQUIRED", APPROVE: "APPROVED", REJECT: "REJECTED", FAIL: "FAILED", CANCEL: "CANCELLED" } as Record<string,string>)[input.action];
      if (!status) throw new Error("INTELLIGENCE_ACTION_INVALID");
      const result = await client.query(`UPDATE intelligence_tasks SET status=$3,started_at=CASE WHEN $3='PROCESSING' THEN NOW() ELSE started_at END,completed_at=CASE WHEN $3 IN ('COMPLETED','FAILED','CANCELLED') THEN NOW() ELSE completed_at END,reviewed_at=CASE WHEN $3 IN ('APPROVED','REJECTED') THEN NOW() ELSE reviewed_at END,reviewed_by=CASE WHEN $3 IN ('APPROVED','REJECTED') THEN $4 ELSE reviewed_by END,explanation=COALESCE($5,explanation),confidence_score=COALESCE($6,confidence_score) WHERE institution_key=$1 AND intelligence_task_id=$2 RETURNING intelligence_task_id`,[input.operator.institutionKey,input.itemId,status,input.operator.userId,input.explanation?.trim() || null,input.confidenceScore ?? null]);
      if (!result.rows[0]) throw new Error("INTELLIGENCE_TASK_NOT_FOUND");
      await recordEvent(client,input.operator,"TASK",input.itemId,`TASK_${status}`,{});
      return { status };
    }
    if (input.itemType === "RECOMMENDATION") {
      const status = ({ ACCEPT: "ACCEPTED", DISMISS: "DISMISSED", IMPLEMENT: "IMPLEMENTED", EXPIRE: "EXPIRED" } as Record<string,string>)[input.action];
      if (!status) throw new Error("INTELLIGENCE_ACTION_INVALID");
      const result = await client.query(`UPDATE intelligence_recommendations SET status=$3,resolved_by=$4,resolved_at=NOW() WHERE institution_key=$1 AND recommendation_id=$2 RETURNING recommendation_id`,[input.operator.institutionKey,input.itemId,status,input.operator.userId]);
      if (!result.rows[0]) throw new Error("INTELLIGENCE_RECOMMENDATION_NOT_FOUND");
      await recordEvent(client,input.operator,"RECOMMENDATION",input.itemId,`RECOMMENDATION_${status}`,{});
      return { status };
    }
    throw new Error("INTELLIGENCE_ITEM_TYPE_INVALID");
  });
}

import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

export type IntegrationOperator = { institutionKey: string; userId: string };

const categories = new Set(["PAYMENTS","IDENTITY","COMPLIANCE","CREDIT","VALUATION","COMMUNICATIONS","ESIGNATURE","OPEN_BANKING","OTHER"]);
const environments = new Set(["SANDBOX","TEST","PRODUCTION"]);
const directions = new Set(["OUTBOUND","INBOUND"]);

export async function listIntegrationWorkspace(operator: IntegrationOperator, query = "") {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const [providers, connections, jobs, reconciliations, summary] = await Promise.all([
      client.query(
        `SELECT provider_id,provider_code,provider_name,category,status,base_url,timeout_ms,max_retries,updated_at
         FROM integration_providers
         WHERE institution_key=$1
           AND ($2='' OR to_tsvector('english',provider_code||' '||provider_name||' '||category) @@ plainto_tsquery('english',$2))
         ORDER BY category,provider_name`,
        [operator.institutionKey, query.trim()],
      ),
      client.query(
        `SELECT c.connection_id,c.connection_name,c.environment,c.status,c.capabilities,c.last_health_check_at,c.last_health_status,c.last_error,
                p.provider_code,p.provider_name,p.category
         FROM integration_connections c
         JOIN integration_providers p ON p.institution_key=c.institution_key AND p.provider_id=c.provider_id
         WHERE c.institution_key=$1
         ORDER BY CASE c.status WHEN 'DEGRADED' THEN 1 WHEN 'ACTIVE' THEN 2 ELSE 3 END,p.provider_name,c.connection_name`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT j.integration_job_id,j.operation,j.direction,j.status,j.correlation_id,j.source_entity_type,j.source_entity_id,
                j.attempt_count,j.max_attempts,j.next_attempt_at,j.error_code,j.error_message,j.created_at,j.completed_at,
                c.connection_name,p.provider_name
         FROM integration_jobs j
         JOIN integration_connections c ON c.institution_key=j.institution_key AND c.connection_id=j.connection_id
         JOIN integration_providers p ON p.institution_key=c.institution_key AND p.provider_id=c.provider_id
         WHERE j.institution_key=$1
         ORDER BY CASE j.status WHEN 'FAILED' THEN 1 WHEN 'DEAD_LETTER' THEN 1 WHEN 'RETRY_SCHEDULED' THEN 2 WHEN 'QUEUED' THEN 3 ELSE 4 END,j.created_at DESC
         LIMIT 300`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT r.reconciliation_id,r.reconciliation_date,r.reconciliation_type,r.status,r.internal_count,r.external_count,
                r.matched_count,r.exception_count,r.completed_at,c.connection_name,p.provider_name
         FROM integration_reconciliations r
         JOIN integration_connections c ON c.institution_key=r.institution_key AND c.connection_id=r.connection_id
         JOIN integration_providers p ON p.institution_key=c.institution_key AND p.provider_id=c.provider_id
         WHERE r.institution_key=$1
         ORDER BY r.reconciliation_date DESC,r.created_at DESC
         LIMIT 100`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT
           (SELECT COUNT(*)::int FROM integration_providers WHERE institution_key=$1 AND status='ACTIVE') AS active_providers,
           (SELECT COUNT(*)::int FROM integration_connections WHERE institution_key=$1 AND status='DEGRADED') AS degraded_connections,
           (SELECT COUNT(*)::int FROM integration_jobs WHERE institution_key=$1 AND status IN ('FAILED','DEAD_LETTER','RETRY_SCHEDULED')) AS job_exceptions,
           (SELECT COUNT(*)::int FROM integration_webhook_events WHERE institution_key=$1 AND status='FAILED') AS failed_webhooks,
           (SELECT COALESCE(SUM(exception_count),0)::int FROM integration_reconciliations WHERE institution_key=$1 AND status IN ('OPEN','IN_PROGRESS','EXCEPTIONS')) AS reconciliation_exceptions`,
        [operator.institutionKey],
      ),
    ]);
    return { providers: providers.rows, connections: connections.rows, jobs: jobs.rows, reconciliations: reconciliations.rows, summary: summary.rows[0] };
  });
}

export async function createIntegrationProvider(input: {
  operator: IntegrationOperator;
  providerCode: string;
  providerName: string;
  category: string;
  baseUrl?: string;
  credentialReference?: string;
  timeoutMs?: number;
  maxRetries?: number;
}) {
  if (!input.providerCode.trim() || !input.providerName.trim()) throw new Error("INTEGRATION_PROVIDER_FIELDS_REQUIRED");
  if (!categories.has(input.category)) throw new Error("INTEGRATION_PROVIDER_CATEGORY_INVALID");
  const timeoutMs = Number(input.timeoutMs || 30000);
  const maxRetries = Number(input.maxRetries ?? 3);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300000) throw new Error("INTEGRATION_TIMEOUT_INVALID");
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 20) throw new Error("INTEGRATION_RETRY_LIMIT_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const providerId = randomUUID();
    await client.query(
      `INSERT INTO integration_providers
       (provider_id,institution_key,provider_code,provider_name,category,base_url,credential_reference,timeout_ms,max_retries,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`,
      [providerId,input.operator.institutionKey,input.providerCode.trim().toUpperCase(),input.providerName.trim(),input.category,input.baseUrl?.trim() || null,input.credentialReference?.trim() || null,timeoutMs,maxRetries,input.operator.userId],
    );
    await recordEvent(client,input.operator,"PROVIDER",providerId,"PROVIDER_CREATED",{ providerCode: input.providerCode.trim().toUpperCase(), category: input.category });
    return { providerId, status: "INACTIVE" };
  });
}

export async function createIntegrationConnection(input: {
  operator: IntegrationOperator;
  providerId: string;
  connectionName: string;
  environment: string;
  capabilities?: string[];
}) {
  if (!input.providerId || !input.connectionName.trim()) throw new Error("INTEGRATION_CONNECTION_FIELDS_REQUIRED");
  if (!environments.has(input.environment)) throw new Error("INTEGRATION_ENVIRONMENT_INVALID");
  const capabilities = Array.isArray(input.capabilities) ? input.capabilities.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim().toUpperCase()) : [];
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const provider = await client.query(`SELECT provider_id FROM integration_providers WHERE institution_key=$1 AND provider_id=$2`,[input.operator.institutionKey,input.providerId]);
    if (!provider.rows[0]) throw new Error("INTEGRATION_PROVIDER_NOT_FOUND");
    const connectionId = randomUUID();
    await client.query(
      `INSERT INTO integration_connections
       (connection_id,institution_key,provider_id,connection_name,environment,capabilities,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$7)`,
      [connectionId,input.operator.institutionKey,input.providerId,input.connectionName.trim(),input.environment,JSON.stringify(capabilities),input.operator.userId],
    );
    await recordEvent(client,input.operator,"CONNECTION",connectionId,"CONNECTION_CREATED",{ providerId: input.providerId, environment: input.environment });
    return { connectionId, status: "INACTIVE" };
  });
}

export async function createIntegrationJob(input: {
  operator: IntegrationOperator;
  connectionId: string;
  operation: string;
  direction: string;
  correlationId?: string;
  idempotencyKey?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  requestPayload?: Record<string, unknown>;
}) {
  if (!input.connectionId || !input.operation.trim()) throw new Error("INTEGRATION_JOB_FIELDS_REQUIRED");
  if (!directions.has(input.direction)) throw new Error("INTEGRATION_DIRECTION_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const connection = await client.query<{ max_retries: number }>(
      `SELECT p.max_retries FROM integration_connections c
       JOIN integration_providers p ON p.institution_key=c.institution_key AND p.provider_id=c.provider_id
       WHERE c.institution_key=$1 AND c.connection_id=$2 AND c.status='ACTIVE'`,
      [input.operator.institutionKey,input.connectionId],
    );
    if (!connection.rows[0]) throw new Error("INTEGRATION_CONNECTION_NOT_FOUND");
    const integrationJobId = randomUUID();
    await client.query(
      `INSERT INTO integration_jobs
       (integration_job_id,institution_key,connection_id,operation,direction,correlation_id,idempotency_key,source_entity_type,source_entity_id,request_payload,max_attempts,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)`,
      [integrationJobId,input.operator.institutionKey,input.connectionId,input.operation.trim().toUpperCase(),input.direction,input.correlationId?.trim() || null,input.idempotencyKey?.trim() || null,input.sourceEntityType?.trim() || null,input.sourceEntityId?.trim() || null,JSON.stringify(input.requestPayload || {}),connection.rows[0].max_retries + 1,input.operator.userId],
    );
    await recordEvent(client,input.operator,"JOB",integrationJobId,"JOB_QUEUED",{ operation: input.operation.trim().toUpperCase(), direction: input.direction });
    return { integrationJobId, status: "QUEUED" };
  });
}

export async function createReconciliation(input: {
  operator: IntegrationOperator;
  connectionId: string;
  reconciliationDate: string;
  reconciliationType: string;
}) {
  if (!input.connectionId || !input.reconciliationDate || !input.reconciliationType.trim()) throw new Error("INTEGRATION_RECONCILIATION_FIELDS_REQUIRED");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const connection = await client.query(`SELECT connection_id FROM integration_connections WHERE institution_key=$1 AND connection_id=$2`,[input.operator.institutionKey,input.connectionId]);
    if (!connection.rows[0]) throw new Error("INTEGRATION_CONNECTION_NOT_FOUND");
    const reconciliationId = randomUUID();
    await client.query(
      `INSERT INTO integration_reconciliations
       (reconciliation_id,institution_key,connection_id,reconciliation_date,reconciliation_type)
       VALUES ($1,$2,$3,$4,$5)`,
      [reconciliationId,input.operator.institutionKey,input.connectionId,input.reconciliationDate,input.reconciliationType.trim().toUpperCase()],
    );
    await recordEvent(client,input.operator,"RECONCILIATION",reconciliationId,"RECONCILIATION_CREATED",{ reconciliationDate: input.reconciliationDate });
    return { reconciliationId, status: "OPEN" };
  });
}

export async function updateIntegrationItem(input: {
  operator: IntegrationOperator;
  itemType: string;
  itemId: string;
  action: string;
  healthStatus?: string;
  errorMessage?: string;
  internalCount?: number;
  externalCount?: number;
  matchedCount?: number;
  exceptionCount?: number;
}) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    if (input.itemType === "PROVIDER") {
      const statusByAction: Record<string,string> = { ACTIVATE: "ACTIVE", DEACTIVATE: "INACTIVE", DEGRADE: "DEGRADED", MAINTENANCE: "MAINTENANCE" };
      const status = statusByAction[input.action];
      if (!status) throw new Error("INTEGRATION_ACTION_INVALID");
      const result = await client.query(`UPDATE integration_providers SET status=$3,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND provider_id=$2 RETURNING provider_id`,[input.operator.institutionKey,input.itemId,status,input.operator.userId]);
      if (!result.rows[0]) throw new Error("INTEGRATION_PROVIDER_NOT_FOUND");
      await recordEvent(client,input.operator,"PROVIDER",input.itemId,`PROVIDER_${status}`,{});
      return { status };
    }
    if (input.itemType === "CONNECTION") {
      const statusByAction: Record<string,string> = { ACTIVATE: "ACTIVE", DEACTIVATE: "INACTIVE", DEGRADE: "DEGRADED", DISABLE: "DISABLED" };
      const status = statusByAction[input.action];
      if (input.action === "HEALTH_CHECK") {
        if (!new Set(["HEALTHY","DEGRADED","UNAVAILABLE"]).has(input.healthStatus || "")) throw new Error("INTEGRATION_HEALTH_STATUS_INVALID");
        const result = await client.query(`UPDATE integration_connections SET last_health_check_at=NOW(),last_health_status=$3,last_error=$4,updated_by=$5,updated_at=NOW() WHERE institution_key=$1 AND connection_id=$2 RETURNING connection_id`,[input.operator.institutionKey,input.itemId,input.healthStatus,input.errorMessage?.trim() || null,input.operator.userId]);
        if (!result.rows[0]) throw new Error("INTEGRATION_CONNECTION_NOT_FOUND");
        await recordEvent(client,input.operator,"CONNECTION",input.itemId,"HEALTH_CHECK_RECORDED",{ healthStatus: input.healthStatus });
        return { status: input.healthStatus };
      }
      if (!status) throw new Error("INTEGRATION_ACTION_INVALID");
      const result = await client.query(`UPDATE integration_connections SET status=$3,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND connection_id=$2 RETURNING connection_id`,[input.operator.institutionKey,input.itemId,status,input.operator.userId]);
      if (!result.rows[0]) throw new Error("INTEGRATION_CONNECTION_NOT_FOUND");
      await recordEvent(client,input.operator,"CONNECTION",input.itemId,`CONNECTION_${status}`,{});
      return { status };
    }
    if (input.itemType === "JOB") {
      const statusByAction: Record<string,string> = { START: "PROCESSING", SUCCEED: "SUCCEEDED", FAIL: "FAILED", RETRY: "RETRY_SCHEDULED", CANCEL: "CANCELLED", DEAD_LETTER: "DEAD_LETTER" };
      const status = statusByAction[input.action];
      if (!status) throw new Error("INTEGRATION_ACTION_INVALID");
      const result = await client.query(
        `UPDATE integration_jobs SET status=$3,
         attempt_count=CASE WHEN $3='PROCESSING' THEN attempt_count+1 ELSE attempt_count END,
         started_at=CASE WHEN $3='PROCESSING' THEN NOW() ELSE started_at END,
         completed_at=CASE WHEN $3 IN ('SUCCEEDED','FAILED','CANCELLED','DEAD_LETTER') THEN NOW() ELSE completed_at END,
         error_message=CASE WHEN $3 IN ('FAILED','DEAD_LETTER') THEN $4 ELSE error_message END,
         next_attempt_at=CASE WHEN $3='RETRY_SCHEDULED' THEN NOW()+INTERVAL '15 minutes' ELSE next_attempt_at END,
         updated_at=NOW()
         WHERE institution_key=$1 AND integration_job_id=$2 RETURNING integration_job_id`,
        [input.operator.institutionKey,input.itemId,status,input.errorMessage?.trim() || null],
      );
      if (!result.rows[0]) throw new Error("INTEGRATION_JOB_NOT_FOUND");
      await recordEvent(client,input.operator,"JOB",input.itemId,`JOB_${status}`,{ errorMessage: input.errorMessage?.trim() || null });
      return { status };
    }
    if (input.itemType === "RECONCILIATION") {
      const statusByAction: Record<string,string> = { START: "IN_PROGRESS", BALANCE: "BALANCED", EXCEPTIONS: "EXCEPTIONS", CLOSE: "CLOSED" };
      const status = statusByAction[input.action];
      if (!status) throw new Error("INTEGRATION_ACTION_INVALID");
      const result = await client.query(
        `UPDATE integration_reconciliations SET status=$3,internal_count=$4,external_count=$5,matched_count=$6,exception_count=$7,
         completed_by=CASE WHEN $3 IN ('BALANCED','CLOSED') THEN $8 ELSE completed_by END,
         completed_at=CASE WHEN $3 IN ('BALANCED','CLOSED') THEN NOW() ELSE completed_at END,updated_at=NOW()
         WHERE institution_key=$1 AND reconciliation_id=$2 RETURNING reconciliation_id`,
        [input.operator.institutionKey,input.itemId,status,Number(input.internalCount || 0),Number(input.externalCount || 0),Number(input.matchedCount || 0),Number(input.exceptionCount || 0),input.operator.userId],
      );
      if (!result.rows[0]) throw new Error("INTEGRATION_RECONCILIATION_NOT_FOUND");
      await recordEvent(client,input.operator,"RECONCILIATION",input.itemId,`RECONCILIATION_${status}`,{ exceptionCount: Number(input.exceptionCount || 0) });
      return { status };
    }
    throw new Error("INTEGRATION_ITEM_TYPE_INVALID");
  });
}

async function recordEvent(client: { query: (text: string, values?: unknown[]) => Promise<unknown> },operator: IntegrationOperator,entityType: string,entityId: string,eventType: string,eventData: Record<string,unknown>) {
  await client.query(
    `INSERT INTO integration_events (integration_event_id,institution_key,entity_type,entity_id,event_type,actor_user_id,event_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [randomUUID(),operator.institutionKey,entityType,entityId,eventType,operator.userId,JSON.stringify(eventData)],
  );
}

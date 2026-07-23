import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

export type ApiOperator = { institutionKey: string; userId: string };

const clientTypes = new Set(["CONFIDENTIAL","PUBLIC","SERVICE"]);
const credentialTypes = new Set(["API_KEY","CLIENT_SECRET","MTLS"]);
const statuses = new Set(["ACTIVE","INACTIVE","SUSPENDED","REVOKED","ARCHIVED"]);

export async function listApiWorkspace(operator: ApiOperator, query = "") {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const [clients,products,credentials,webhooks,logs,summary] = await Promise.all([
      client.query(
        `SELECT api_client_id,client_name,client_code,description,status,client_type,scopes,created_at,updated_at
         FROM api_clients
         WHERE institution_key=$1
           AND ($2='' OR to_tsvector('english',client_name||' '||client_code||' '||COALESCE(description,'')) @@ plainto_tsquery('english',$2))
         ORDER BY client_name`,
        [operator.institutionKey,query.trim()],
      ),
      client.query(
        `SELECT api_product_id,product_code,product_name,description,base_path,version,status,default_rate_limit,documentation_url,created_at,updated_at
         FROM api_products
         WHERE institution_key=$1
         ORDER BY product_code,version`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT c.api_credential_id,c.api_client_id,c.credential_type,c.public_identifier,c.status,c.expires_at,c.last_used_at,c.created_at,
                cl.client_name,cl.client_code
         FROM api_credentials c
         JOIN api_clients cl ON cl.institution_key=c.institution_key AND cl.api_client_id=c.api_client_id
         WHERE c.institution_key=$1
         ORDER BY c.created_at DESC
         LIMIT 250`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT w.api_webhook_id,w.api_client_id,w.webhook_name,w.endpoint_url,w.event_types,w.status,w.last_delivery_at,w.last_delivery_status,w.created_at,
                cl.client_name,cl.client_code
         FROM api_webhooks w
         JOIN api_clients cl ON cl.institution_key=w.institution_key AND cl.api_client_id=w.api_client_id
         WHERE w.institution_key=$1
         ORDER BY w.created_at DESC
         LIMIT 250`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT l.api_request_log_id,l.request_id,l.http_method,l.request_path,l.response_status,l.duration_ms,l.source_ip,l.created_at,
                cl.client_name,p.product_name
         FROM api_request_logs l
         LEFT JOIN api_clients cl ON cl.institution_key=l.institution_key AND cl.api_client_id=l.api_client_id
         LEFT JOIN api_products p ON p.institution_key=l.institution_key AND p.api_product_id=l.api_product_id
         WHERE l.institution_key=$1
         ORDER BY l.created_at DESC
         LIMIT 250`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT
           (SELECT COUNT(*)::int FROM api_clients WHERE institution_key=$1 AND status='ACTIVE') AS active_clients,
           (SELECT COUNT(*)::int FROM api_products WHERE institution_key=$1 AND status='ACTIVE') AS active_products,
           (SELECT COUNT(*)::int FROM api_credentials WHERE institution_key=$1 AND status='ACTIVE') AS active_credentials,
           (SELECT COUNT(*)::int FROM api_webhooks WHERE institution_key=$1 AND status='ACTIVE') AS active_webhooks,
           (SELECT COUNT(*)::int FROM api_request_logs WHERE institution_key=$1 AND created_at >= NOW() - INTERVAL '24 hours') AS requests_last_24_hours,
           (SELECT COUNT(*)::int FROM api_request_logs WHERE institution_key=$1 AND response_status >= 500 AND created_at >= NOW() - INTERVAL '24 hours') AS server_errors_last_24_hours`,
        [operator.institutionKey],
      ),
    ]);
    return { clients: clients.rows, products: products.rows, credentials: credentials.rows, webhooks: webhooks.rows, logs: logs.rows, summary: summary.rows[0] };
  });
}

export async function createApiClient(input: { operator: ApiOperator; clientName: string; clientCode: string; clientType?: string; description?: string; scopes?: string[]; redirectUris?: string[]; allowedOrigins?: string[] }) {
  if (!input.clientName.trim() || !input.clientCode.trim()) throw new Error("API_CLIENT_FIELDS_REQUIRED");
  const clientType = input.clientType || "CONFIDENTIAL";
  if (!clientTypes.has(clientType)) throw new Error("API_CLIENT_TYPE_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const apiClientId = randomUUID();
    await client.query(
      `INSERT INTO api_clients
       (api_client_id,institution_key,client_name,client_code,description,client_type,scopes,redirect_uris,allowed_origins,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$10)`,
      [apiClientId,input.operator.institutionKey,input.clientName.trim(),input.clientCode.trim().toUpperCase(),input.description?.trim() || null,clientType,JSON.stringify(input.scopes || []),JSON.stringify(input.redirectUris || []),JSON.stringify(input.allowedOrigins || []),input.operator.userId],
    );
    await recordEvent(client,input.operator,"CLIENT",apiClientId,"API_CLIENT_CREATED",{ clientType });
    return { apiClientId,status: "ACTIVE" };
  });
}

export async function createApiProduct(input: { operator: ApiOperator; productCode: string; productName: string; basePath: string; version?: string; description?: string; defaultRateLimit?: number; documentationUrl?: string }) {
  if (!input.productCode.trim() || !input.productName.trim() || !input.basePath.trim()) throw new Error("API_PRODUCT_FIELDS_REQUIRED");
  const defaultRateLimit = Number.isFinite(input.defaultRateLimit) ? Number(input.defaultRateLimit) : 1000;
  if (defaultRateLimit < 1) throw new Error("API_RATE_LIMIT_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const apiProductId = randomUUID();
    await client.query(
      `INSERT INTO api_products
       (api_product_id,institution_key,product_code,product_name,description,base_path,version,default_rate_limit,documentation_url,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`,
      [apiProductId,input.operator.institutionKey,input.productCode.trim().toUpperCase(),input.productName.trim(),input.description?.trim() || null,input.basePath.trim(),input.version?.trim() || "v1",defaultRateLimit,input.documentationUrl?.trim() || null,input.operator.userId],
    );
    await recordEvent(client,input.operator,"PRODUCT",apiProductId,"API_PRODUCT_CREATED",{ version: input.version?.trim() || "v1" });
    return { apiProductId,status: "ACTIVE" };
  });
}

export async function issueApiCredential(input: { operator: ApiOperator; apiClientId: string; credentialType?: string; expiresAt?: string }) {
  const credentialType = input.credentialType || "API_KEY";
  if (!input.apiClientId || !credentialTypes.has(credentialType)) throw new Error("API_CREDENTIAL_FIELDS_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const existingClient = await client.query(`SELECT api_client_id FROM api_clients WHERE institution_key=$1 AND api_client_id=$2`,[input.operator.institutionKey,input.apiClientId]);
    if (!existingClient.rows[0]) throw new Error("API_CLIENT_NOT_FOUND");
    const apiCredentialId = randomUUID();
    const publicIdentifier = `sain_${randomBytes(8).toString("hex")}`;
    const secret = randomBytes(32).toString("base64url");
    const secretHash = createHash("sha256").update(secret).digest("hex");
    await client.query(
      `INSERT INTO api_credentials
       (api_credential_id,institution_key,api_client_id,credential_type,public_identifier,secret_hash,expires_at,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [apiCredentialId,input.operator.institutionKey,input.apiClientId,credentialType,publicIdentifier,secretHash,input.expiresAt || null,input.operator.userId],
    );
    await recordEvent(client,input.operator,"CREDENTIAL",apiCredentialId,"API_CREDENTIAL_ISSUED",{ apiClientId: input.apiClientId, credentialType });
    return { apiCredentialId,publicIdentifier,secret,status: "ACTIVE" };
  });
}

export async function createApiWebhook(input: { operator: ApiOperator; apiClientId: string; webhookName: string; endpointUrl: string; eventTypes?: string[] }) {
  if (!input.apiClientId || !input.webhookName.trim() || !input.endpointUrl.trim()) throw new Error("API_WEBHOOK_FIELDS_REQUIRED");
  let parsed: URL;
  try { parsed = new URL(input.endpointUrl); } catch { throw new Error("API_WEBHOOK_URL_INVALID"); }
  if (!new Set(["https:","http:"]).has(parsed.protocol)) throw new Error("API_WEBHOOK_URL_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const existingClient = await client.query(`SELECT api_client_id FROM api_clients WHERE institution_key=$1 AND api_client_id=$2`,[input.operator.institutionKey,input.apiClientId]);
    if (!existingClient.rows[0]) throw new Error("API_CLIENT_NOT_FOUND");
    const apiWebhookId = randomUUID();
    const signingSecret = randomBytes(32).toString("base64url");
    const signingSecretHash = createHash("sha256").update(signingSecret).digest("hex");
    await client.query(
      `INSERT INTO api_webhooks
       (api_webhook_id,institution_key,api_client_id,webhook_name,endpoint_url,event_types,signing_secret_hash,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$8)`,
      [apiWebhookId,input.operator.institutionKey,input.apiClientId,input.webhookName.trim(),input.endpointUrl.trim(),JSON.stringify(input.eventTypes || []),signingSecretHash,input.operator.userId],
    );
    await recordEvent(client,input.operator,"WEBHOOK",apiWebhookId,"API_WEBHOOK_CREATED",{ apiClientId: input.apiClientId });
    return { apiWebhookId,signingSecret,status: "ACTIVE" };
  });
}

export async function updateApiItem(input: { operator: ApiOperator; itemType: string; itemId: string; action: string }) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    if (input.itemType === "CLIENT" || input.itemType === "PRODUCT") {
      const statusByAction: Record<string,string> = { ACTIVATE: "ACTIVE", DEACTIVATE: "INACTIVE", SUSPEND: "SUSPENDED", ARCHIVE: "ARCHIVED" };
      const status = statusByAction[input.action];
      if (!status || !statuses.has(status)) throw new Error("API_ACTION_INVALID");
      const table = input.itemType === "CLIENT" ? "api_clients" : "api_products";
      const idColumn = input.itemType === "CLIENT" ? "api_client_id" : "api_product_id";
      const result = await client.query(`UPDATE ${table} SET status=$3,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND ${idColumn}=$2 RETURNING ${idColumn}`,[input.operator.institutionKey,input.itemId,status,input.operator.userId]);
      if (!result.rows[0]) throw new Error(`API_${input.itemType}_NOT_FOUND`);
      await recordEvent(client,input.operator,input.itemType,input.itemId,`API_${input.itemType}_${status}`,{});
      return { status };
    }
    if (input.itemType === "CREDENTIAL") {
      const statusByAction: Record<string,string> = { ACTIVATE: "ACTIVE", REVOKE: "REVOKED" };
      const status = statusByAction[input.action];
      if (!status) throw new Error("API_ACTION_INVALID");
      const result = await client.query(`UPDATE api_credentials SET status=$3,revoked_at=CASE WHEN $3='REVOKED' THEN NOW() ELSE NULL END WHERE institution_key=$1 AND api_credential_id=$2 RETURNING api_credential_id`,[input.operator.institutionKey,input.itemId,status]);
      if (!result.rows[0]) throw new Error("API_CREDENTIAL_NOT_FOUND");
      await recordEvent(client,input.operator,"CREDENTIAL",input.itemId,`API_CREDENTIAL_${status}`,{});
      return { status };
    }
    if (input.itemType === "WEBHOOK") {
      const statusByAction: Record<string,string> = { ACTIVATE: "ACTIVE", DEACTIVATE: "INACTIVE", SUSPEND: "SUSPENDED" };
      const status = statusByAction[input.action];
      if (!status) throw new Error("API_ACTION_INVALID");
      const result = await client.query(`UPDATE api_webhooks SET status=$3,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND api_webhook_id=$2 RETURNING api_webhook_id`,[input.operator.institutionKey,input.itemId,status,input.operator.userId]);
      if (!result.rows[0]) throw new Error("API_WEBHOOK_NOT_FOUND");
      await recordEvent(client,input.operator,"WEBHOOK",input.itemId,`API_WEBHOOK_${status}`,{});
      return { status };
    }
    throw new Error("API_ITEM_TYPE_INVALID");
  });
}

async function recordEvent(client: { query: (text: string, values?: unknown[]) => Promise<unknown> }, operator: ApiOperator, entityType: string, entityId: string, eventType: string, eventData: Record<string,unknown>) {
  await client.query(`INSERT INTO api_events (api_event_id,institution_key,entity_type,entity_id,event_type,event_data,actor_user_id) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,[randomUUID(),operator.institutionKey,entityType,entityId,eventType,JSON.stringify(eventData),operator.userId]);
}

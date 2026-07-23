import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

export type SecurityOperator = { institutionKey: string; userId: string };

const mfaMethods = new Set(["TOTP","SMS","EMAIL","WEBAUTHN","HARDWARE_KEY"]);
const policyDecisions = new Set(["ALLOW","DENY","CHALLENGE"]);
const eventSeverities = new Set(["INFO","LOW","MEDIUM","HIGH","CRITICAL"]);
const findingSeverities = new Set(["LOW","MEDIUM","HIGH","CRITICAL"]);

export async function listSecurityWorkspace(operator: SecurityOperator, query = "") {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const [methods, devices, sessions, policies, keys, secrets, events, findings, recoveryPlans, summary] = await Promise.all([
      client.query(
        `SELECT security_mfa_method_id,user_id,method_type,display_name,status,verified_at,last_used_at,created_at
         FROM security_mfa_methods
         WHERE institution_key=$1
           AND ($2='' OR to_tsvector('english',user_id||' '||display_name||' '||method_type) @@ plainto_tsquery('english',$2))
         ORDER BY created_at DESC LIMIT 250`,
        [operator.institutionKey, query.trim()],
      ),
      client.query(
        `SELECT security_trusted_device_id,user_id,device_name,platform,browser,ip_address,trust_level,status,trusted_at,expires_at,last_seen_at,revoked_at
         FROM security_trusted_devices
         WHERE institution_key=$1
         ORDER BY CASE status WHEN 'TRUSTED' THEN 1 ELSE 2 END,last_seen_at DESC NULLS LAST
         LIMIT 250`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT security_session_id,user_id,device_fingerprint,ip_address,user_agent,authentication_strength,risk_score,status,started_at,last_activity_at,expires_at,revoked_at,revocation_reason
         FROM security_sessions
         WHERE institution_key=$1
         ORDER BY CASE status WHEN 'ACTIVE' THEN 1 ELSE 2 END,last_activity_at DESC
         LIMIT 250`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT security_access_policy_id,policy_code,policy_name,resource_type,action_pattern,decision,priority,status,description,conditions,updated_at
         FROM security_access_policies
         WHERE institution_key=$1
         ORDER BY priority,policy_name`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT security_encryption_key_id,key_alias,key_purpose,provider,algorithm,key_version,rotation_interval_days,next_rotation_at,last_rotated_at,status
         FROM security_encryption_keys
         WHERE institution_key=$1
         ORDER BY key_alias,key_version DESC`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT security_secret_id,secret_name,secret_type,vault_provider,owner_team,rotation_interval_days,next_rotation_at,last_rotated_at,expires_at,status
         FROM security_secrets
         WHERE institution_key=$1
         ORDER BY secret_name`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT security_event_id,event_type,severity,source,title,description,user_id,ip_address,risk_score,status,assigned_to,detected_at,acknowledged_at,resolved_at
         FROM security_events
         WHERE institution_key=$1
         ORDER BY CASE status WHEN 'OPEN' THEN 1 WHEN 'ACKNOWLEDGED' THEN 2 ELSE 3 END,
                  CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
                  detected_at DESC
         LIMIT 250`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT security_finding_id,finding_code,finding_type,title,severity,affected_asset,owner_user_id,remediation_plan,target_date,status,identified_at,remediated_at,verified_at
         FROM security_findings
         WHERE institution_key=$1
         ORDER BY CASE status WHEN 'OPEN' THEN 1 WHEN 'IN_PROGRESS' THEN 2 ELSE 3 END,
                  CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
                  identified_at DESC
         LIMIT 250`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT security_recovery_plan_id,plan_code,plan_name,plan_type,business_service,recovery_time_objective_minutes,recovery_point_objective_minutes,primary_owner,secondary_owner,runbook_location,last_tested_at,next_test_at,last_test_result,status
         FROM security_recovery_plans
         WHERE institution_key=$1
         ORDER BY business_service,plan_name`,
        [operator.institutionKey],
      ),
      client.query(
        `SELECT
           (SELECT COUNT(*)::int FROM security_mfa_methods WHERE institution_key=$1 AND status='ACTIVE') AS active_mfa_methods,
           (SELECT COUNT(*)::int FROM security_trusted_devices WHERE institution_key=$1 AND status='TRUSTED') AS trusted_devices,
           (SELECT COUNT(*)::int FROM security_sessions WHERE institution_key=$1 AND status='ACTIVE') AS active_sessions,
           (SELECT COUNT(*)::int FROM security_events WHERE institution_key=$1 AND status IN ('OPEN','ACKNOWLEDGED') AND severity IN ('HIGH','CRITICAL')) AS high_risk_events,
           (SELECT COUNT(*)::int FROM security_findings WHERE institution_key=$1 AND status IN ('OPEN','IN_PROGRESS') AND severity='CRITICAL') AS critical_findings,
           (SELECT COUNT(*)::int FROM security_encryption_keys WHERE institution_key=$1 AND status='ACTIVE' AND next_rotation_at IS NOT NULL AND next_rotation_at <= NOW() + INTERVAL '30 days') AS keys_due_rotation,
           (SELECT COUNT(*)::int FROM security_recovery_plans WHERE institution_key=$1 AND status='ACTIVE' AND next_test_at IS NOT NULL AND next_test_at <= NOW() + INTERVAL '30 days') AS recovery_tests_due`,
        [operator.institutionKey],
      ),
    ]);

    return {
      methods: methods.rows,
      devices: devices.rows,
      sessions: sessions.rows,
      policies: policies.rows,
      keys: keys.rows,
      secrets: secrets.rows,
      events: events.rows,
      findings: findings.rows,
      recoveryPlans: recoveryPlans.rows,
      summary: summary.rows[0],
    };
  });
}

export async function createMfaMethod(input: { operator: SecurityOperator; userId: string; methodType: string; displayName: string; credentialId?: string; publicKey?: string; phoneLastFour?: string; emailAddress?: string; secretReference?: string }) {
  if (!input.userId.trim() || !input.displayName.trim() || !mfaMethods.has(input.methodType)) throw new Error("SECURITY_MFA_FIELDS_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const id = randomUUID();
    await client.query(
      `INSERT INTO security_mfa_methods
       (security_mfa_method_id,institution_key,user_id,method_type,display_name,credential_id,public_key,phone_last_four,email_address,secret_reference,verified_at,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),$11,$11)`,
      [id,input.operator.institutionKey,input.userId.trim(),input.methodType,input.displayName.trim(),input.credentialId?.trim() || null,input.publicKey?.trim() || null,input.phoneLastFour?.trim() || null,input.emailAddress?.trim() || null,input.secretReference?.trim() || null,input.operator.userId],
    );
    await recordAudit(client,input.operator,"MFA_METHOD",id,"MFA_METHOD_CREATED",{ methodType: input.methodType, userId: input.userId.trim() });
    return { securityMfaMethodId: id, status: "ACTIVE" };
  });
}

export async function createTrustedDevice(input: { operator: SecurityOperator; userId: string; deviceName: string; deviceFingerprint: string; platform?: string; browser?: string; ipAddress?: string; trustLevel?: string; expiresAt?: string }) {
  if (!input.userId.trim() || !input.deviceName.trim() || !input.deviceFingerprint.trim()) throw new Error("SECURITY_DEVICE_FIELDS_REQUIRED");
  const trustLevel = input.trustLevel || "STANDARD";
  if (!new Set(["STANDARD","HIGH","PRIVILEGED"]).has(trustLevel)) throw new Error("SECURITY_DEVICE_TRUST_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const id = randomUUID();
    await client.query(
      `INSERT INTO security_trusted_devices
       (security_trusted_device_id,institution_key,user_id,device_name,device_fingerprint,platform,browser,ip_address,trust_level,expires_at,last_seen_at,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),$11,$11)
       ON CONFLICT (institution_key,user_id,device_fingerprint)
       DO UPDATE SET device_name=EXCLUDED.device_name,platform=EXCLUDED.platform,browser=EXCLUDED.browser,ip_address=EXCLUDED.ip_address,trust_level=EXCLUDED.trust_level,status='TRUSTED',expires_at=EXCLUDED.expires_at,last_seen_at=NOW(),revoked_at=NULL,updated_by=EXCLUDED.updated_by,updated_at=NOW()
       RETURNING security_trusted_device_id`,
      [id,input.operator.institutionKey,input.userId.trim(),input.deviceName.trim(),input.deviceFingerprint.trim(),input.platform?.trim() || null,input.browser?.trim() || null,input.ipAddress?.trim() || null,trustLevel,input.expiresAt || null,input.operator.userId],
    );
    await recordAudit(client,input.operator,"TRUSTED_DEVICE",id,"DEVICE_TRUSTED",{ userId: input.userId.trim(), trustLevel });
    return { securityTrustedDeviceId: id, status: "TRUSTED" };
  });
}

export async function createAccessPolicy(input: { operator: SecurityOperator; policyCode: string; policyName: string; resourceType: string; actionPattern: string; decision: string; priority?: number; description?: string; conditions?: Record<string,unknown> }) {
  if (!input.policyCode.trim() || !input.policyName.trim() || !input.resourceType.trim() || !input.actionPattern.trim() || !policyDecisions.has(input.decision)) throw new Error("SECURITY_POLICY_FIELDS_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const id = randomUUID();
    await client.query(
      `INSERT INTO security_access_policies
       (security_access_policy_id,institution_key,policy_code,policy_name,description,resource_type,action_pattern,decision,priority,conditions,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$11)`,
      [id,input.operator.institutionKey,input.policyCode.trim().toUpperCase(),input.policyName.trim(),input.description?.trim() || null,input.resourceType.trim().toUpperCase(),input.actionPattern.trim(),input.decision,input.priority ?? 100,JSON.stringify(input.conditions || {}),input.operator.userId],
    );
    await recordAudit(client,input.operator,"ACCESS_POLICY",id,"ACCESS_POLICY_CREATED",{ decision: input.decision, resourceType: input.resourceType.trim().toUpperCase() });
    return { securityAccessPolicyId: id, status: "ACTIVE" };
  });
}

export async function createEncryptionKey(input: { operator: SecurityOperator; keyAlias: string; keyPurpose: string; provider: string; providerKeyReference: string; algorithm: string; rotationIntervalDays?: number; nextRotationAt?: string }) {
  if (!input.keyAlias.trim() || !input.keyPurpose.trim() || !input.provider.trim() || !input.providerKeyReference.trim() || !input.algorithm.trim()) throw new Error("SECURITY_KEY_FIELDS_REQUIRED");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const latest = await client.query(`SELECT COALESCE(MAX(key_version),0)::int AS version FROM security_encryption_keys WHERE institution_key=$1 AND key_alias=$2`,[input.operator.institutionKey,input.keyAlias.trim().toUpperCase()]);
    const keyVersion = Number(latest.rows[0]?.version || 0) + 1;
    const id = randomUUID();
    await client.query(
      `INSERT INTO security_encryption_keys
       (security_encryption_key_id,institution_key,key_alias,key_purpose,provider,provider_key_reference,algorithm,key_version,rotation_interval_days,next_rotation_at,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
      [id,input.operator.institutionKey,input.keyAlias.trim().toUpperCase(),input.keyPurpose.trim().toUpperCase(),input.provider.trim().toUpperCase(),input.providerKeyReference.trim(),input.algorithm.trim().toUpperCase(),keyVersion,input.rotationIntervalDays ?? null,input.nextRotationAt || null,input.operator.userId],
    );
    await recordAudit(client,input.operator,"ENCRYPTION_KEY",id,"ENCRYPTION_KEY_REGISTERED",{ keyAlias: input.keyAlias.trim().toUpperCase(), keyVersion });
    return { securityEncryptionKeyId: id, keyVersion, status: "ACTIVE" };
  });
}

export async function createSecret(input: { operator: SecurityOperator; secretName: string; secretType: string; vaultProvider: string; vaultReference: string; ownerTeam?: string; rotationIntervalDays?: number; nextRotationAt?: string; expiresAt?: string }) {
  if (!input.secretName.trim() || !input.secretType.trim() || !input.vaultProvider.trim() || !input.vaultReference.trim()) throw new Error("SECURITY_SECRET_FIELDS_REQUIRED");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const id = randomUUID();
    await client.query(
      `INSERT INTO security_secrets
       (security_secret_id,institution_key,secret_name,secret_type,vault_provider,vault_reference,owner_team,rotation_interval_days,next_rotation_at,expires_at,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
      [id,input.operator.institutionKey,input.secretName.trim().toUpperCase(),input.secretType.trim().toUpperCase(),input.vaultProvider.trim().toUpperCase(),input.vaultReference.trim(),input.ownerTeam?.trim() || null,input.rotationIntervalDays ?? null,input.nextRotationAt || null,input.expiresAt || null,input.operator.userId],
    );
    await recordAudit(client,input.operator,"SECRET",id,"SECRET_REGISTERED",{ secretName: input.secretName.trim().toUpperCase() });
    return { securitySecretId: id, status: "ACTIVE" };
  });
}

export async function createSecurityEvent(input: { operator: SecurityOperator; eventType: string; severity: string; source: string; title: string; description: string; userId?: string; securitySessionId?: string; ipAddress?: string; riskScore?: number; eventData?: Record<string,unknown>; assignedTo?: string }) {
  if (!input.eventType.trim() || !input.source.trim() || !input.title.trim() || !input.description.trim() || !eventSeverities.has(input.severity)) throw new Error("SECURITY_EVENT_FIELDS_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const id = randomUUID();
    await client.query(
      `INSERT INTO security_events
       (security_event_id,institution_key,event_type,severity,source,title,description,user_id,security_session_id,ip_address,risk_score,event_data,assigned_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`,
      [id,input.operator.institutionKey,input.eventType.trim().toUpperCase(),input.severity,input.source.trim().toUpperCase(),input.title.trim(),input.description.trim(),input.userId?.trim() || null,input.securitySessionId || null,input.ipAddress?.trim() || null,input.riskScore ?? null,JSON.stringify(input.eventData || {}),input.assignedTo?.trim() || null],
    );
    await recordAudit(client,input.operator,"SECURITY_EVENT",id,"SECURITY_EVENT_CREATED",{ severity: input.severity, source: input.source.trim().toUpperCase() });
    return { securityEventId: id, status: "OPEN" };
  });
}

export async function createSecurityFinding(input: { operator: SecurityOperator; findingCode: string; findingType: string; title: string; description: string; severity: string; affectedAsset?: string; ownerUserId?: string; remediationPlan?: string; targetDate?: string }) {
  if (!input.findingCode.trim() || !input.findingType.trim() || !input.title.trim() || !input.description.trim() || !findingSeverities.has(input.severity)) throw new Error("SECURITY_FINDING_FIELDS_INVALID");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const id = randomUUID();
    await client.query(
      `INSERT INTO security_findings
       (security_finding_id,institution_key,finding_code,finding_type,title,description,severity,affected_asset,owner_user_id,remediation_plan,target_date,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
      [id,input.operator.institutionKey,input.findingCode.trim().toUpperCase(),input.findingType.trim().toUpperCase(),input.title.trim(),input.description.trim(),input.severity,input.affectedAsset?.trim() || null,input.ownerUserId?.trim() || null,input.remediationPlan?.trim() || null,input.targetDate || null,input.operator.userId],
    );
    await recordAudit(client,input.operator,"SECURITY_FINDING",id,"SECURITY_FINDING_CREATED",{ severity: input.severity, findingType: input.findingType.trim().toUpperCase() });
    return { securityFindingId: id, status: "OPEN" };
  });
}

export async function createRecoveryPlan(input: { operator: SecurityOperator; planCode: string; planName: string; planType: string; businessService: string; recoveryTimeObjectiveMinutes?: number; recoveryPointObjectiveMinutes?: number; primaryOwner: string; secondaryOwner?: string; runbookLocation?: string; nextTestAt?: string }) {
  if (!input.planCode.trim() || !input.planName.trim() || !input.planType.trim() || !input.businessService.trim() || !input.primaryOwner.trim()) throw new Error("SECURITY_RECOVERY_FIELDS_REQUIRED");
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const id = randomUUID();
    await client.query(
      `INSERT INTO security_recovery_plans
       (security_recovery_plan_id,institution_key,plan_code,plan_name,plan_type,business_service,recovery_time_objective_minutes,recovery_point_objective_minutes,primary_owner,secondary_owner,runbook_location,next_test_at,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)`,
      [id,input.operator.institutionKey,input.planCode.trim().toUpperCase(),input.planName.trim(),input.planType.trim().toUpperCase(),input.businessService.trim(),input.recoveryTimeObjectiveMinutes ?? null,input.recoveryPointObjectiveMinutes ?? null,input.primaryOwner.trim(),input.secondaryOwner?.trim() || null,input.runbookLocation?.trim() || null,input.nextTestAt || null,input.operator.userId],
    );
    await recordAudit(client,input.operator,"RECOVERY_PLAN",id,"RECOVERY_PLAN_CREATED",{ planType: input.planType.trim().toUpperCase(), businessService: input.businessService.trim() });
    return { securityRecoveryPlanId: id, status: "ACTIVE" };
  });
}

export async function updateSecurityItem(input: { operator: SecurityOperator; itemType: string; itemId: string; action: string }) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    if (input.itemType === "MFA_METHOD") {
      const status = ({ ACTIVATE: "ACTIVE", DISABLE: "DISABLED", REVOKE: "REVOKED" } as Record<string,string>)[input.action];
      if (!status) throw new Error("SECURITY_ACTION_INVALID");
      const result = await client.query(`UPDATE security_mfa_methods SET status=$3,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND security_mfa_method_id=$2 RETURNING security_mfa_method_id`,[input.operator.institutionKey,input.itemId,status,input.operator.userId]);
      if (!result.rows[0]) throw new Error("SECURITY_MFA_METHOD_NOT_FOUND");
      await recordAudit(client,input.operator,"MFA_METHOD",input.itemId,`MFA_METHOD_${status}`,{});
      return { status };
    }

    if (input.itemType === "DEVICE") {
      const status = ({ TRUST: "TRUSTED", SUSPEND: "SUSPENDED", REVOKE: "REVOKED" } as Record<string,string>)[input.action];
      if (!status) throw new Error("SECURITY_ACTION_INVALID");
      const result = await client.query(`UPDATE security_trusted_devices SET status=$3,revoked_at=CASE WHEN $3='REVOKED' THEN NOW() ELSE NULL END,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND security_trusted_device_id=$2 RETURNING security_trusted_device_id`,[input.operator.institutionKey,input.itemId,status,input.operator.userId]);
      if (!result.rows[0]) throw new Error("SECURITY_DEVICE_NOT_FOUND");
      await recordAudit(client,input.operator,"TRUSTED_DEVICE",input.itemId,`DEVICE_${status}`,{});
      return { status };
    }

    if (input.itemType === "SESSION") {
      if (input.action !== "REVOKE") throw new Error("SECURITY_ACTION_INVALID");
      const result = await client.query(`UPDATE security_sessions SET status='REVOKED',revoked_at=NOW(),revocation_reason='OPERATOR_REVOKED',updated_at=NOW() WHERE institution_key=$1 AND security_session_id=$2 RETURNING security_session_id`,[input.operator.institutionKey,input.itemId]);
      if (!result.rows[0]) throw new Error("SECURITY_SESSION_NOT_FOUND");
      await recordAudit(client,input.operator,"SESSION",input.itemId,"SESSION_REVOKED",{});
      return { status: "REVOKED" };
    }

    if (input.itemType === "POLICY") {
      const status = ({ ACTIVATE: "ACTIVE", DEACTIVATE: "INACTIVE", ARCHIVE: "ARCHIVED" } as Record<string,string>)[input.action];
      if (!status) throw new Error("SECURITY_ACTION_INVALID");
      const result = await client.query(`UPDATE security_access_policies SET status=$3,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND security_access_policy_id=$2 RETURNING security_access_policy_id`,[input.operator.institutionKey,input.itemId,status,input.operator.userId]);
      if (!result.rows[0]) throw new Error("SECURITY_POLICY_NOT_FOUND");
      await recordAudit(client,input.operator,"ACCESS_POLICY",input.itemId,`ACCESS_POLICY_${status}`,{});
      return { status };
    }

    if (input.itemType === "KEY") {
      const statusByAction: Record<string,string> = { ACTIVATE: "ACTIVE", DISABLE: "DISABLED", RETIRE: "RETIRED" };
      const status = statusByAction[input.action];
      if (!status && input.action !== "ROTATE") throw new Error("SECURITY_ACTION_INVALID");
      if (input.action === "ROTATE") {
        const result = await client.query(`UPDATE security_encryption_keys SET last_rotated_at=NOW(),next_rotation_at=CASE WHEN rotation_interval_days IS NULL THEN NULL ELSE NOW() + make_interval(days => rotation_interval_days) END,updated_by=$3,updated_at=NOW() WHERE institution_key=$1 AND security_encryption_key_id=$2 RETURNING security_encryption_key_id`,[input.operator.institutionKey,input.itemId,input.operator.userId]);
        if (!result.rows[0]) throw new Error("SECURITY_KEY_NOT_FOUND");
        await recordAudit(client,input.operator,"ENCRYPTION_KEY",input.itemId,"ENCRYPTION_KEY_ROTATED",{});
        return { status: "ACTIVE" };
      }
      const result = await client.query(`UPDATE security_encryption_keys SET status=$3,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND security_encryption_key_id=$2 RETURNING security_encryption_key_id`,[input.operator.institutionKey,input.itemId,status,input.operator.userId]);
      if (!result.rows[0]) throw new Error("SECURITY_KEY_NOT_FOUND");
      await recordAudit(client,input.operator,"ENCRYPTION_KEY",input.itemId,`ENCRYPTION_KEY_${status}`,{});
      return { status };
    }

    if (input.itemType === "SECRET") {
      const statusByAction: Record<string,string> = { ACTIVATE: "ACTIVE", DISABLE: "DISABLED", REVOKE: "REVOKED" };
      const status = statusByAction[input.action];
      if (!status && input.action !== "ROTATE") throw new Error("SECURITY_ACTION_INVALID");
      if (input.action === "ROTATE") {
        const result = await client.query(`UPDATE security_secrets SET last_rotated_at=NOW(),next_rotation_at=CASE WHEN rotation_interval_days IS NULL THEN NULL ELSE NOW() + make_interval(days => rotation_interval_days) END,updated_by=$3,updated_at=NOW() WHERE institution_key=$1 AND security_secret_id=$2 RETURNING security_secret_id`,[input.operator.institutionKey,input.itemId,input.operator.userId]);
        if (!result.rows[0]) throw new Error("SECURITY_SECRET_NOT_FOUND");
        await recordAudit(client,input.operator,"SECRET",input.itemId,"SECRET_ROTATED",{});
        return { status: "ACTIVE" };
      }
      const result = await client.query(`UPDATE security_secrets SET status=$3,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND security_secret_id=$2 RETURNING security_secret_id`,[input.operator.institutionKey,input.itemId,status,input.operator.userId]);
      if (!result.rows[0]) throw new Error("SECURITY_SECRET_NOT_FOUND");
      await recordAudit(client,input.operator,"SECRET",input.itemId,`SECRET_${status}`,{});
      return { status };
    }

    if (input.itemType === "EVENT") {
      const status = ({ ACKNOWLEDGE: "ACKNOWLEDGED", RESOLVE: "RESOLVED", DISMISS: "DISMISSED", REOPEN: "OPEN" } as Record<string,string>)[input.action];
      if (!status) throw new Error("SECURITY_ACTION_INVALID");
      const result = await client.query(`UPDATE security_events SET status=$3,acknowledged_at=CASE WHEN $3='ACKNOWLEDGED' THEN NOW() ELSE acknowledged_at END,resolved_at=CASE WHEN $3='RESOLVED' THEN NOW() ELSE resolved_at END,updated_at=NOW() WHERE institution_key=$1 AND security_event_id=$2 RETURNING security_event_id`,[input.operator.institutionKey,input.itemId,status]);
      if (!result.rows[0]) throw new Error("SECURITY_EVENT_NOT_FOUND");
      await recordAudit(client,input.operator,"SECURITY_EVENT",input.itemId,`SECURITY_EVENT_${status}`,{});
      return { status };
    }

    if (input.itemType === "FINDING") {
      const status = ({ START: "IN_PROGRESS", REMEDIATE: "REMEDIATED", VERIFY: "VERIFIED", ACCEPT: "RISK_ACCEPTED", REOPEN: "OPEN" } as Record<string,string>)[input.action];
      if (!status) throw new Error("SECURITY_ACTION_INVALID");
      const result = await client.query(`UPDATE security_findings SET status=$3,remediated_at=CASE WHEN $3='REMEDIATED' THEN NOW() ELSE remediated_at END,verified_at=CASE WHEN $3='VERIFIED' THEN NOW() ELSE verified_at END,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND security_finding_id=$2 RETURNING security_finding_id`,[input.operator.institutionKey,input.itemId,status,input.operator.userId]);
      if (!result.rows[0]) throw new Error("SECURITY_FINDING_NOT_FOUND");
      await recordAudit(client,input.operator,"SECURITY_FINDING",input.itemId,`SECURITY_FINDING_${status}`,{});
      return { status };
    }

    if (input.itemType === "RECOVERY_PLAN") {
      const status = ({ ACTIVATE: "ACTIVE", DEACTIVATE: "INACTIVE", RETIRE: "RETIRED" } as Record<string,string>)[input.action];
      if (!status && !new Set(["TEST_PASS","TEST_FAIL"]).has(input.action)) throw new Error("SECURITY_ACTION_INVALID");
      if (input.action === "TEST_PASS" || input.action === "TEST_FAIL") {
        const testResult = input.action === "TEST_PASS" ? "PASS" : "FAIL";
        const result = await client.query(`UPDATE security_recovery_plans SET last_tested_at=NOW(),last_test_result=$3,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND security_recovery_plan_id=$2 RETURNING security_recovery_plan_id`,[input.operator.institutionKey,input.itemId,testResult,input.operator.userId]);
        if (!result.rows[0]) throw new Error("SECURITY_RECOVERY_PLAN_NOT_FOUND");
        await recordAudit(client,input.operator,"RECOVERY_PLAN",input.itemId,`RECOVERY_TEST_${testResult}`,{});
        return { status: "ACTIVE", testResult };
      }
      const result = await client.query(`UPDATE security_recovery_plans SET status=$3,updated_by=$4,updated_at=NOW() WHERE institution_key=$1 AND security_recovery_plan_id=$2 RETURNING security_recovery_plan_id`,[input.operator.institutionKey,input.itemId,status,input.operator.userId]);
      if (!result.rows[0]) throw new Error("SECURITY_RECOVERY_PLAN_NOT_FOUND");
      await recordAudit(client,input.operator,"RECOVERY_PLAN",input.itemId,`RECOVERY_PLAN_${status}`,{});
      return { status };
    }

    throw new Error("SECURITY_ITEM_TYPE_INVALID");
  });
}

async function recordAudit(client: { query: (text: string, values?: unknown[]) => Promise<unknown> }, operator: SecurityOperator, entityType: string, entityId: string, eventType: string, eventData: Record<string,unknown>) {
  await client.query(
    `INSERT INTO security_audit_events
     (security_audit_event_id,institution_key,entity_type,entity_id,event_type,event_data,actor_user_id)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
    [randomUUID(),operator.institutionKey,entityType,entityId,eventType,JSON.stringify(eventData),operator.userId],
  );
}

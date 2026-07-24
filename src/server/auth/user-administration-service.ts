import { randomBytes, randomUUID, scrypt as scryptCallback, type ScryptOptions } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

const PASSWORD_KEY_LENGTH = 64;
const SCRYPT_PARAMETERS = { N: 16_384, r: 8, p: 1 };
const MANAGED_USER_STATUSES = new Set(["ACTIVE", "SUSPENDED", "DISABLED"]);

export type CreateOperatorUserInput = {
  institutionKey: string;
  email: string;
  displayName?: string;
  temporaryPassword: string;
  actorUserId: string;
};

export type UpdateOperatorUserStatusInput = {
  institutionKey: string;
  targetUserId: string;
  status: string;
  reason?: string;
  actorUserId: string;
};

type UserListRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  status: string;
  email_verified_at: Date | string | null;
  created_at: Date | string;
  last_login_at: Date | string | null;
  roles: string[] | null;
  permissions: string[] | null;
  role_assignments: Array<{
    userRoleId: string;
    roleCode: string;
    status: string;
    effectiveAt: string;
    expiresAt?: string;
  }> | null;
};

type ManagedUserRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  status: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function validateEmail(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("INVALID_EMAIL");
}

function validatePassword(password: string) {
  if (password.length < 12) throw new Error("PASSWORD_TOO_SHORT");
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("PASSWORD_COMPLEXITY_REQUIRED");
  }
}

function scrypt(password: string, salt: string, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

async function createPasswordRecord(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scrypt(password, salt, PASSWORD_KEY_LENGTH, {
    ...SCRYPT_PARAMETERS,
    maxmem: 64 * 1024 * 1024,
  });
  return {
    secretHash: derived.toString("base64url"),
    hashAlgorithm: "SCRYPT",
    hashParameters: { ...SCRYPT_PARAMETERS, keyLength: PASSWORD_KEY_LENGTH, salt },
  };
}

async function assertInstitutionAdministrator(
  client: { query: Function },
  institutionKey: string,
  actorUserId: string,
) {
  const result = await client.query(
    `SELECT 1
     FROM user_roles
     JOIN roles ON roles.role_id = user_roles.role_id
     WHERE user_roles.institution_key = $1
       AND user_roles.user_id = $2
       AND user_roles.status = 'ACTIVE'
       AND user_roles.effective_at <= NOW()
       AND (user_roles.expires_at IS NULL OR user_roles.expires_at > NOW())
       AND roles.role_code = 'INSTITUTION_ADMIN'
       AND roles.status = 'ACTIVE'
     LIMIT 1`,
    [institutionKey, actorUserId],
  );
  if (!result.rows.length) throw new Error("ROLE_ADMIN_REQUIRED");
}

export async function createOperatorUser(input: CreateOperatorUserInput) {
  const email = normalizeEmail(input.email);
  const displayName = input.displayName?.trim() || undefined;
  validateEmail(email);
  validatePassword(input.temporaryPassword);
  const passwordRecord = await createPasswordRecord(input.temporaryPassword);
  const userId = randomUUID();
  const credentialId = randomUUID();
  const database = new PostgresDatabase();

  return database.transaction(async (client) => {
    await assertInstitutionAdministrator(client, input.institutionKey, input.actorUserId);

    const duplicate = await client.query<{ user_id: string }>(
      `SELECT user_id FROM users WHERE institution_key = $1 AND email = $2 LIMIT 1`,
      [input.institutionKey, email],
    );
    if (duplicate.rows.length) throw new Error("USER_ALREADY_EXISTS");

    await client.query(
      `INSERT INTO users (
         user_id, institution_key, email, display_name, status, email_verified_at, metadata
       ) VALUES ($1, $2, $3, $4, 'ACTIVE', NOW(), $5::jsonb)`,
      [
        userId,
        input.institutionKey,
        email,
        displayName ?? null,
        JSON.stringify({ provisionedBy: input.actorUserId, temporaryPassword: true }),
      ],
    );

    await client.query(
      `INSERT INTO user_credentials (
         credential_id, user_id, credential_type, secret_hash, hash_algorithm,
         hash_parameters, password_changed_at
       ) VALUES ($1, $2, 'PASSWORD', $3, $4, $5::jsonb, NOW())`,
      [
        credentialId,
        userId,
        passwordRecord.secretHash,
        passwordRecord.hashAlgorithm,
        JSON.stringify(passwordRecord.hashParameters),
      ],
    );

    return {
      userId,
      institutionKey: input.institutionKey,
      email,
      displayName,
      status: "ACTIVE" as const,
      requiresPasswordChange: true,
    };
  });
}

export async function listOperatorUsers(institutionKey: string, actorUserId: string) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    await assertInstitutionAdministrator(client, institutionKey, actorUserId);
    const result = await client.query<UserListRow>(
      `SELECT
         users.user_id,
         users.email,
         users.display_name,
         users.status,
         users.email_verified_at,
         users.created_at,
         MAX(login_events.created_at) FILTER (WHERE login_events.outcome = 'SUCCESS') AS last_login_at,
         COALESCE(
           array_agg(DISTINCT roles.role_code)
             FILTER (
               WHERE roles.role_code IS NOT NULL
                 AND user_roles.status = 'ACTIVE'
                 AND user_roles.effective_at <= NOW()
                 AND (user_roles.expires_at IS NULL OR user_roles.expires_at > NOW())
             ),
           '{}'
         ) AS roles,
         COALESCE(
           array_agg(DISTINCT permissions.permission_code)
             FILTER (
               WHERE permissions.permission_code IS NOT NULL
                 AND user_roles.status = 'ACTIVE'
                 AND user_roles.effective_at <= NOW()
                 AND (user_roles.expires_at IS NULL OR user_roles.expires_at > NOW())
             ),
           '{}'
         ) AS permissions,
         COALESCE(
           jsonb_agg(
             DISTINCT jsonb_build_object(
               'userRoleId', user_roles.user_role_id,
               'roleCode', roles.role_code,
               'status', user_roles.status,
               'effectiveAt', user_roles.effective_at,
               'expiresAt', user_roles.expires_at
             )
           ) FILTER (WHERE user_roles.user_role_id IS NOT NULL),
           '[]'::jsonb
         ) AS role_assignments
       FROM users
       LEFT JOIN login_events
         ON login_events.institution_key = users.institution_key
        AND login_events.user_id = users.user_id
       LEFT JOIN user_roles
         ON user_roles.institution_key = users.institution_key
        AND user_roles.user_id = users.user_id
       LEFT JOIN roles ON roles.role_id = user_roles.role_id
       LEFT JOIN role_permissions ON role_permissions.role_id = roles.role_id
       LEFT JOIN permissions
         ON permissions.permission_id = role_permissions.permission_id
        AND permissions.status = 'ACTIVE'
       WHERE users.institution_key = $1
       GROUP BY users.user_id, users.email, users.display_name, users.status,
                users.email_verified_at, users.created_at
       ORDER BY users.created_at DESC, users.email ASC`,
      [institutionKey],
    );
    return result.rows.map((row) => ({
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name ?? undefined,
      status: row.status,
      emailVerifiedAt: row.email_verified_at ? new Date(row.email_verified_at).toISOString() : undefined,
      createdAt: new Date(row.created_at).toISOString(),
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : undefined,
      roles: row.roles ?? [],
      permissions: row.permissions ?? [],
      roleAssignments: (row.role_assignments ?? []).map((assignment) => ({
        ...assignment,
        effectiveAt: new Date(assignment.effectiveAt).toISOString(),
        expiresAt: assignment.expiresAt ? new Date(assignment.expiresAt).toISOString() : undefined,
      })),
    }));
  });
}

export async function updateOperatorUserStatus(input: UpdateOperatorUserStatusInput) {
  const status = input.status.trim().toUpperCase();
  const reason = input.reason?.trim() || undefined;
  if (!input.targetUserId.trim()) throw new Error("TARGET_USER_REQUIRED");
  if (!MANAGED_USER_STATUSES.has(status)) throw new Error("INVALID_USER_STATUS");
  if (input.targetUserId === input.actorUserId) throw new Error("SELF_STATUS_CHANGE_NOT_ALLOWED");
  if (status !== "ACTIVE" && !reason) throw new Error("STATUS_CHANGE_REASON_REQUIRED");

  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    await assertInstitutionAdministrator(client, input.institutionKey, input.actorUserId);

    const result = await client.query<ManagedUserRow>(
      `SELECT user_id, email, display_name, status
       FROM users
       WHERE institution_key = $1 AND user_id = $2
       FOR UPDATE`,
      [input.institutionKey, input.targetUserId],
    );
    const user = result.rows[0];
    if (!user) throw new Error("USER_NOT_FOUND");
    if (user.status === status) throw new Error("USER_STATUS_UNCHANGED");

    await client.query(
      `UPDATE users
       SET status = $3,
           suspended_at = CASE WHEN $3 = 'SUSPENDED' THEN NOW() ELSE NULL END,
           suspended_reason = CASE WHEN $3 = 'SUSPENDED' THEN $4 ELSE NULL END,
           metadata = metadata || $5::jsonb,
           updated_at = NOW()
       WHERE institution_key = $1 AND user_id = $2`,
      [
        input.institutionKey,
        input.targetUserId,
        status,
        reason ?? null,
        JSON.stringify({
          lastStatusChange: {
            previousStatus: user.status,
            resultingStatus: status,
            reason: reason ?? null,
            actorUserId: input.actorUserId,
            changedAt: new Date().toISOString(),
          },
        }),
      ],
    );

    if (status !== "ACTIVE") {
      await client.query(
        `UPDATE sessions
         SET status = 'REVOKED', revoked_at = NOW(), revoked_by = $3,
             revoke_reason = 'ACCOUNT_STATUS_CHANGED', updated_at = NOW()
         WHERE institution_key = $1 AND user_id = $2 AND status = 'ACTIVE'`,
        [input.institutionKey, input.targetUserId, input.actorUserId],
      );
    }

    return {
      userId: user.user_id,
      email: user.email,
      displayName: user.display_name ?? undefined,
      previousStatus: user.status,
      status,
      reason,
      sessionsRevoked: status !== "ACTIVE",
    };
  });
}

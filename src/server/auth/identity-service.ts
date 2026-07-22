import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

const SESSION_TTL_SECONDS = 60 * 60 * 8;
const PASSWORD_KEY_LENGTH = 64;
const SCRYPT_PARAMETERS = { N: 16_384, r: 8, p: 1 } as const;

export type AuthenticatedOperator = {
  sessionId: string;
  userId: string;
  institutionKey: string;
  email: string;
  displayName?: string;
  roles: string[];
  permissions: string[];
  issuedAt: number;
  expiresAt: number;
};

type RequestMetadata = {
  sourceIp?: string;
  userAgent?: string;
  deviceId?: string;
};

type UserRow = {
  user_id: string;
  institution_key: string;
  email: string;
  display_name: string | null;
  status: string;
  credential_id: string | null;
  secret_hash: string | null;
  hash_algorithm: string | null;
  hash_parameters: Record<string, unknown> | null;
  failed_attempts: number | null;
  locked_until: Date | string | null;
};

function institutionKey() {
  return process.env.SAIN_INSTITUTION_KEY?.trim() || "sain-finance";
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function equalText(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
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

async function derivePassword(password: string, salt: string, parameters = SCRYPT_PARAMETERS) {
  return scrypt(password, salt, PASSWORD_KEY_LENGTH, {
    N: parameters.N,
    r: parameters.r,
    p: parameters.p,
    maxmem: 64 * 1024 * 1024,
  });
}

async function createPasswordRecord(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const derived = await derivePassword(password, salt);
  return {
    secretHash: derived.toString("base64url"),
    hashAlgorithm: "SCRYPT",
    hashParameters: { ...SCRYPT_PARAMETERS, keyLength: PASSWORD_KEY_LENGTH, salt },
  };
}

async function verifyPassword(password: string, user: UserRow) {
  if (!user.secret_hash || user.hash_algorithm !== "SCRYPT" || !user.hash_parameters) return false;
  const salt = String(user.hash_parameters.salt || "");
  const N = Number(user.hash_parameters.N || SCRYPT_PARAMETERS.N);
  const r = Number(user.hash_parameters.r || SCRYPT_PARAMETERS.r);
  const p = Number(user.hash_parameters.p || SCRYPT_PARAMETERS.p);
  if (!salt || !Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  const expected = Buffer.from(user.secret_hash, "base64url");
  const supplied = await derivePassword(password, salt, { N, r, p });
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

async function findUser(client: { query: Function }, email: string): Promise<UserRow | undefined> {
  const result = await client.query(
    `SELECT
       users.user_id,
       users.institution_key,
       users.email,
       users.display_name,
       users.status,
       user_credentials.credential_id,
       user_credentials.secret_hash,
       user_credentials.hash_algorithm,
       user_credentials.hash_parameters,
       user_credentials.failed_attempts,
       user_credentials.locked_until
     FROM users
     LEFT JOIN user_credentials
       ON user_credentials.user_id = users.user_id
      AND user_credentials.credential_type = 'PASSWORD'
      AND user_credentials.revoked_at IS NULL
     WHERE users.institution_key = $1 AND users.email = $2
     ORDER BY user_credentials.created_at DESC
     LIMIT 1`,
    [institutionKey(), email],
  );
  return result.rows[0] as UserRow | undefined;
}

async function bootstrapEnvironmentAdministrator(client: { query: Function }, email: string, password: string) {
  const configuredEmail = normalizeEmail(process.env.SAIN_ADMIN_EMAIL || "");
  const configuredPassword = process.env.SAIN_ADMIN_PASSWORD || "";
  if (!configuredEmail || configuredPassword.length < 12) return undefined;
  if (!equalText(email, configuredEmail) || !equalText(password, configuredPassword)) return undefined;

  const userId = randomUUID();
  const credentialId = randomUUID();
  const userRoleId = randomUUID();
  const record = await createPasswordRecord(password);

  await client.query(
    `INSERT INTO users (
       user_id, institution_key, email, display_name, status, email_verified_at, metadata
     ) VALUES ($1, $2, $3, $4, 'ACTIVE', NOW(), $5::jsonb)`,
    [userId, institutionKey(), email, "Institution Administrator", JSON.stringify({ bootstrappedFromEnvironment: true })],
  );
  await client.query(
    `INSERT INTO user_credentials (
       credential_id, user_id, credential_type, secret_hash, hash_algorithm,
       hash_parameters, password_changed_at
     ) VALUES ($1, $2, 'PASSWORD', $3, $4, $5::jsonb, NOW())`,
    [credentialId, userId, record.secretHash, record.hashAlgorithm, JSON.stringify(record.hashParameters)],
  );
  await client.query(
    `INSERT INTO user_roles (
       user_role_id, institution_key, user_id, role_id, status, effective_at, assigned_by
     ) VALUES ($1, $2, $3, 'role-institution-administrator', 'ACTIVE', NOW(), $3)`,
    [userRoleId, institutionKey(), userId],
  );

  return findUser(client, email);
}

async function recordLoginEvent(
  client: { query: Function },
  input: {
    userId?: string;
    email: string;
    outcome: "SUCCESS" | "FAILURE" | "BLOCKED";
    reason?: string;
    sessionId?: string;
    metadata: RequestMetadata;
  },
) {
  await client.query(
    `INSERT INTO login_events (
       login_event_id, institution_key, user_id, attempted_email, event_type,
       outcome, reason, session_id, source_ip, user_agent, device_id, metadata
     ) VALUES ($1, $2, $3, $4, 'LOGIN', $5, $6, $7, $8::inet, $9, $10, '{}'::jsonb)`,
    [
      randomUUID(), institutionKey(), input.userId ?? null, input.email,
      input.outcome, input.reason ?? null, input.sessionId ?? null,
      input.metadata.sourceIp ?? null, input.metadata.userAgent ?? null,
      input.metadata.deviceId ?? null,
    ],
  );
}

async function loadRolesAndPermissions(client: { query: Function }, userId: string) {
  const result = await client.query(
    `SELECT
       COALESCE(array_agg(DISTINCT roles.role_code) FILTER (WHERE roles.role_code IS NOT NULL), '{}') AS roles,
       COALESCE(array_agg(DISTINCT permissions.permission_code) FILTER (WHERE permissions.permission_code IS NOT NULL), '{}') AS permissions
     FROM user_roles
     JOIN roles ON roles.role_id = user_roles.role_id AND roles.status = 'ACTIVE'
     LEFT JOIN role_permissions ON role_permissions.role_id = roles.role_id
     LEFT JOIN permissions ON permissions.permission_id = role_permissions.permission_id AND permissions.status = 'ACTIVE'
     WHERE user_roles.institution_key = $1
       AND user_roles.user_id = $2
       AND user_roles.status = 'ACTIVE'
       AND user_roles.effective_at <= NOW()
       AND (user_roles.expires_at IS NULL OR user_roles.expires_at > NOW())`,
    [institutionKey(), userId],
  );
  return {
    roles: (result.rows[0]?.roles ?? []) as string[],
    permissions: (result.rows[0]?.permissions ?? []) as string[],
  };
}

export async function authenticateOperator(emailInput: string, password: string, metadata: RequestMetadata = {}) {
  const email = normalizeEmail(emailInput);
  const database = new PostgresDatabase();

  return database.transaction(async (client) => {
    let user = await findUser(client, email);
    if (!user) user = await bootstrapEnvironmentAdministrator(client, email, password);

    if (!user) {
      await recordLoginEvent(client, { email, outcome: "FAILURE", reason: "INVALID_CREDENTIALS", metadata });
      return null;
    }

    if (user.status !== "ACTIVE") {
      await recordLoginEvent(client, { userId: user.user_id, email, outcome: "BLOCKED", reason: `ACCOUNT_${user.status}`, metadata });
      return null;
    }

    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      await recordLoginEvent(client, { userId: user.user_id, email, outcome: "BLOCKED", reason: "CREDENTIAL_LOCKED", metadata });
      return null;
    }

    const valid = await verifyPassword(password, user);
    if (!valid) {
      if (user.credential_id) {
        await client.query(
          `UPDATE user_credentials
           SET failed_attempts = failed_attempts + 1,
               locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END,
               updated_at = NOW()
           WHERE credential_id = $1`,
          [user.credential_id],
        );
      }
      await recordLoginEvent(client, { userId: user.user_id, email, outcome: "FAILURE", reason: "INVALID_CREDENTIALS", metadata });
      return null;
    }

    if (user.credential_id) {
      await client.query(
        `UPDATE user_credentials SET failed_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE credential_id = $1`,
        [user.credential_id],
      );
    }

    const authorization = await loadRolesAndPermissions(client, user.user_id);
    if (!authorization.roles.length) {
      await recordLoginEvent(client, { userId: user.user_id, email, outcome: "BLOCKED", reason: "NO_ACTIVE_ROLE", metadata });
      return null;
    }

    const token = randomBytes(32).toString("base64url");
    const sessionId = randomUUID();
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + SESSION_TTL_SECONDS;

    await client.query(
      `INSERT INTO sessions (
         session_id, institution_key, user_id, token_hash, status, issued_at,
         expires_at, last_seen_at, source_ip, user_agent, device_id, metadata
       ) VALUES ($1, $2, $3, $4, 'ACTIVE', to_timestamp($5), to_timestamp($6), NOW(), $7::inet, $8, $9, '{}'::jsonb)`,
      [sessionId, institutionKey(), user.user_id, tokenHash(token), issuedAt, expiresAt, metadata.sourceIp ?? null, metadata.userAgent ?? null, metadata.deviceId ?? null],
    );
    await recordLoginEvent(client, { userId: user.user_id, email, outcome: "SUCCESS", sessionId, metadata });

    return {
      token,
      operator: {
        sessionId,
        userId: user.user_id,
        institutionKey: user.institution_key,
        email: user.email,
        displayName: user.display_name ?? undefined,
        roles: authorization.roles,
        permissions: authorization.permissions,
        issuedAt,
        expiresAt,
      } satisfies AuthenticatedOperator,
    };
  });
}

export async function verifyOperatorToken(token: string | undefined): Promise<AuthenticatedOperator | null> {
  if (!token) return null;
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const result = await client.query(
      `SELECT
         sessions.session_id,
         sessions.user_id,
         sessions.institution_key,
         sessions.issued_at,
         sessions.expires_at,
         users.email,
         users.display_name,
         users.status AS user_status
       FROM sessions
       JOIN users ON users.user_id = sessions.user_id
       WHERE sessions.token_hash = $1
         AND sessions.status = 'ACTIVE'
         AND sessions.expires_at > NOW()
       FOR UPDATE`,
      [tokenHash(token)],
    );
    const row = result.rows[0];
    if (!row || row.user_status !== "ACTIVE") return null;

    const authorization = await loadRolesAndPermissions(client, row.user_id);
    if (!authorization.roles.length) return null;

    await client.query(
      `UPDATE sessions SET last_seen_at = NOW(), updated_at = NOW() WHERE session_id = $1`,
      [row.session_id],
    );

    return {
      sessionId: row.session_id,
      userId: row.user_id,
      institutionKey: row.institution_key,
      email: row.email,
      displayName: row.display_name ?? undefined,
      roles: authorization.roles,
      permissions: authorization.permissions,
      issuedAt: Math.floor(new Date(row.issued_at).getTime() / 1000),
      expiresAt: Math.floor(new Date(row.expires_at).getTime() / 1000),
    };
  });
}

export async function revokeOperatorToken(token: string | undefined, revokedBy?: string) {
  if (!token) return;
  const database = new PostgresDatabase();
  await database.transaction(async (client) => {
    await client.query(
      `UPDATE sessions
       SET status = 'REVOKED', revoked_at = NOW(), revoked_by = $2, revoke_reason = 'USER_LOGOUT', updated_at = NOW()
       WHERE token_hash = $1 AND status = 'ACTIVE'`,
      [tokenHash(token), revokedBy ?? null],
    );
  });
}

export function operatorSessionTtlSeconds() {
  return SESSION_TTL_SECONDS;
}

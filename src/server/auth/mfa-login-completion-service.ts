import {
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

const SESSION_TTL_SECONDS = 60 * 60 * 8;
const TOTP_PERIOD_SECONDS = 30;
const TOTP_WINDOW = 1;
const MFA_FAILURE_LIMIT = 5;
const MFA_LOCK_MINUTES = 15;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

type RequestMetadata = {
  sourceIp?: string;
  userAgent?: string;
  deviceId?: string;
};

type ChallengeRow = {
  mfa_method_id: string;
  institution_key: string;
  user_id: string;
  encrypted_secret: string;
  secret_iv: string;
  secret_auth_tag: string;
  failed_attempts: number;
  locked_until: Date | string | null;
  metadata: Record<string, unknown> | null;
  email: string;
  display_name: string | null;
  user_status: string;
};

export type CompletedMfaLogin = {
  token: string;
  operator: {
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
};

function institutionKey() {
  return process.env.SAIN_INSTITUTION_KEY?.trim() || "sain-finance";
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getEncryptionKey(): Buffer {
  const configured = process.env.MFA_ENCRYPTION_KEY;
  if (!configured) throw new Error("MFA_ENCRYPTION_KEY_REQUIRED");
  const key = /^[0-9a-f]{64}$/i.test(configured)
    ? Buffer.from(configured, "hex")
    : Buffer.from(configured, "base64");
  if (key.length !== 32) throw new Error("MFA_ENCRYPTION_KEY_INVALID");
  return key;
}

function decryptSecret(row: ChallengeRow): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(row.secret_iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(row.secret_auth_tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.encrypted_secret, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function decodeBase32(value: string): Buffer {
  const normalized = value.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = "";
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("MFA_SECRET_INVALID");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotp(secret: string, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function verifyTotp(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const supplied = Buffer.from(code, "utf8");
  const counter = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS);
  for (let drift = -TOTP_WINDOW; drift <= TOTP_WINDOW; drift += 1) {
    const expected = Buffer.from(generateTotp(secret, counter + drift), "utf8");
    if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) return true;
  }
  return false;
}

async function loadAuthorization(client: { query: Function }, userId: string) {
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

async function recordEvent(
  client: { query: Function },
  row: ChallengeRow,
  outcome: "SUCCESS" | "FAILURE" | "BLOCKED",
  reason: string,
  metadata: RequestMetadata,
  sessionId?: string,
) {
  await client.query(
    `INSERT INTO login_events (
       login_event_id, institution_key, user_id, attempted_email, event_type,
       outcome, reason, session_id, source_ip, user_agent, device_id, metadata
     ) VALUES ($1, $2, $3, $4, 'LOGIN', $5, $6, $7, $8::inet, $9, $10, '{}'::jsonb)`,
    [
      randomUUID(), row.institution_key, row.user_id, row.email, outcome, reason,
      sessionId ?? null, metadata.sourceIp ?? null, metadata.userAgent ?? null,
      metadata.deviceId ?? null,
    ],
  );
}

export async function completeMfaLogin(
  challengeTokenInput: string,
  codeInput: string,
  metadata: RequestMetadata = {},
): Promise<CompletedMfaLogin> {
  const challengeToken = challengeTokenInput.trim();
  const code = codeInput.trim();
  if (!challengeToken) throw new Error("MFA_CHALLENGE_REQUIRED");
  if (!/^\d{6}$/.test(code)) throw new Error("MFA_CODE_INVALID_FORMAT");

  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const result = await client.query(
      `SELECT
         methods.mfa_method_id, methods.institution_key, methods.user_id,
         methods.encrypted_secret, methods.secret_iv, methods.secret_auth_tag,
         methods.failed_attempts, methods.locked_until, methods.metadata,
         users.email, users.display_name, users.status AS user_status
       FROM user_mfa_methods methods
       JOIN users ON users.user_id = methods.user_id
       WHERE methods.institution_key = $1
         AND methods.method_type = 'TOTP'
         AND methods.status = 'ACTIVE'
         AND methods.metadata->>'loginChallengeHash' = $2
       LIMIT 1
       FOR UPDATE`,
      [institutionKey(), tokenHash(challengeToken)],
    );

    const row = result.rows[0] as ChallengeRow | undefined;
    if (!row) throw new Error("MFA_CHALLENGE_INVALID");
    if (row.user_status !== "ACTIVE") {
      await recordEvent(client, row, "BLOCKED", `ACCOUNT_${row.user_status}`, metadata);
      throw new Error("MFA_LOGIN_BLOCKED");
    }

    const challengeExpiresAt = Number(row.metadata?.loginChallengeExpiresAt || 0);
    if (!challengeExpiresAt || challengeExpiresAt <= Math.floor(Date.now() / 1000)) {
      await client.query(
        `UPDATE user_mfa_methods
         SET metadata = COALESCE(metadata, '{}'::jsonb) - 'loginChallengeHash' - 'loginChallengeIssuedAt' - 'loginChallengeExpiresAt' - 'loginChallengeSourceIp' - 'loginChallengeDeviceId',
             updated_at = NOW()
         WHERE mfa_method_id = $1`,
        [row.mfa_method_id],
      );
      await recordEvent(client, row, "BLOCKED", "MFA_CHALLENGE_EXPIRED", metadata);
      throw new Error("MFA_CHALLENGE_EXPIRED");
    }

    if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
      await recordEvent(client, row, "BLOCKED", "MFA_METHOD_LOCKED", metadata);
      throw new Error("MFA_METHOD_LOCKED");
    }

    if (!verifyTotp(decryptSecret(row), code)) {
      const nextFailures = Number(row.failed_attempts || 0) + 1;
      await client.query(
        `UPDATE user_mfa_methods
         SET failed_attempts = $2,
             locked_until = CASE WHEN $2 >= $3 THEN NOW() + ($4 * INTERVAL '1 minute') ELSE NULL END,
             updated_at = NOW()
         WHERE mfa_method_id = $1`,
        [row.mfa_method_id, nextFailures, MFA_FAILURE_LIMIT, MFA_LOCK_MINUTES],
      );
      await recordEvent(client, row, nextFailures >= MFA_FAILURE_LIMIT ? "BLOCKED" : "FAILURE", "MFA_CODE_INVALID", metadata);
      throw new Error(nextFailures >= MFA_FAILURE_LIMIT ? "MFA_METHOD_LOCKED" : "MFA_CODE_INVALID");
    }

    const authorization = await loadAuthorization(client, row.user_id);
    if (!authorization.roles.length) {
      await recordEvent(client, row, "BLOCKED", "NO_ACTIVE_ROLE", metadata);
      throw new Error("MFA_LOGIN_BLOCKED");
    }

    const token = randomBytes(32).toString("base64url");
    const sessionId = randomUUID();
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + SESSION_TTL_SECONDS;

    await client.query(
      `INSERT INTO sessions (
         session_id, institution_key, user_id, token_hash, status, issued_at,
         expires_at, last_seen_at, source_ip, user_agent, device_id, metadata
       ) VALUES ($1, $2, $3, $4, 'ACTIVE', to_timestamp($5), to_timestamp($6), NOW(), $7::inet, $8, $9, $10::jsonb)`,
      [
        sessionId, row.institution_key, row.user_id, tokenHash(token), issuedAt, expiresAt,
        metadata.sourceIp ?? null, metadata.userAgent ?? null, metadata.deviceId ?? null,
        JSON.stringify({ authenticatedWithMfa: true, mfaMethodId: row.mfa_method_id }),
      ],
    );

    await client.query(
      `UPDATE user_mfa_methods
       SET failed_attempts = 0,
           locked_until = NULL,
           last_used_at = NOW(),
           metadata = COALESCE(metadata, '{}'::jsonb) - 'loginChallengeHash' - 'loginChallengeIssuedAt' - 'loginChallengeExpiresAt' - 'loginChallengeSourceIp' - 'loginChallengeDeviceId',
           updated_at = NOW()
       WHERE mfa_method_id = $1`,
      [row.mfa_method_id],
    );

    await recordEvent(client, row, "SUCCESS", "MFA_COMPLETED", metadata, sessionId);

    return {
      token,
      operator: {
        sessionId,
        userId: row.user_id,
        institutionKey: row.institution_key,
        email: row.email,
        displayName: row.display_name ?? undefined,
        roles: authorization.roles,
        permissions: authorization.permissions,
        issuedAt,
        expiresAt,
      },
    };
  });
}

import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

const PASSWORD_KEY_LENGTH = 64;
const SCRYPT_PARAMETERS = { N: 16_384, r: 8, p: 1 };
const PASSWORD_HISTORY_LIMIT = 5;

type CredentialRow = {
  credential_id: string;
  secret_hash: string;
  hash_algorithm: string;
  hash_parameters: Record<string, unknown>;
  revoked_at: Date | string | null;
};

export type ChangeOperatorPasswordInput = {
  institutionKey: string;
  userId: string;
  sessionId: string;
  currentPassword: string;
  newPassword: string;
};

export type ResetOperatorPasswordInput = {
  institutionKey: string;
  actorUserId: string;
  targetUserId: string;
  temporaryPassword: string;
  reason: string;
};

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

async function passwordMatches(password: string, credential: CredentialRow) {
  if (credential.hash_algorithm !== "SCRYPT") return false;
  const salt = String(credential.hash_parameters.salt || "");
  const N = Number(credential.hash_parameters.N || SCRYPT_PARAMETERS.N);
  const r = Number(credential.hash_parameters.r || SCRYPT_PARAMETERS.r);
  const p = Number(credential.hash_parameters.p || SCRYPT_PARAMETERS.p);
  if (!salt || !Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  const expected = Buffer.from(credential.secret_hash, "base64url");
  const supplied = await scrypt(password, salt, PASSWORD_KEY_LENGTH, {
    N,
    r,
    p,
    maxmem: 64 * 1024 * 1024,
  });
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
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

export async function changeOperatorPassword(input: ChangeOperatorPasswordInput) {
  if (!input.currentPassword) throw new Error("CURRENT_PASSWORD_REQUIRED");
  validatePassword(input.newPassword);
  if (input.currentPassword === input.newPassword) throw new Error("PASSWORD_REUSE_NOT_ALLOWED");

  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const result = await client.query<CredentialRow>(
      `SELECT credential_id, secret_hash, hash_algorithm, hash_parameters, revoked_at
       FROM user_credentials
       WHERE user_id = $1 AND credential_type = 'PASSWORD'
       ORDER BY created_at DESC
       LIMIT $2
       FOR UPDATE`,
      [input.userId, PASSWORD_HISTORY_LIMIT],
    );
    const current = result.rows.find((credential) => credential.revoked_at === null);
    if (!current || !(await passwordMatches(input.currentPassword, current))) {
      throw new Error("CURRENT_PASSWORD_INVALID");
    }

    for (const credential of result.rows) {
      if (await passwordMatches(input.newPassword, credential)) {
        throw new Error("PASSWORD_REUSE_NOT_ALLOWED");
      }
    }

    const record = await createPasswordRecord(input.newPassword);
    const credentialId = randomUUID();

    await client.query(
      `UPDATE user_credentials
       SET revoked_at = NOW(), updated_at = NOW()
       WHERE credential_id = $1 AND revoked_at IS NULL`,
      [current.credential_id],
    );
    await client.query(
      `INSERT INTO user_credentials (
         credential_id, user_id, credential_type, secret_hash, hash_algorithm,
         hash_parameters, password_changed_at
       ) VALUES ($1, $2, 'PASSWORD', $3, $4, $5::jsonb, NOW())`,
      [credentialId, input.userId, record.secretHash, record.hashAlgorithm, JSON.stringify(record.hashParameters)],
    );
    await client.query(
      `UPDATE users
       SET metadata = metadata - 'temporaryPassword', updated_at = NOW()
       WHERE institution_key = $1 AND user_id = $2`,
      [input.institutionKey, input.userId],
    );
    await client.query(
      `UPDATE sessions
       SET status = 'REVOKED', revoked_at = NOW(), revoked_by = $2,
           revoke_reason = 'PASSWORD_CHANGED', updated_at = NOW()
       WHERE institution_key = $1 AND user_id = $2 AND session_id <> $3 AND status = 'ACTIVE'`,
      [input.institutionKey, input.userId, input.sessionId],
    );
    await client.query(
      `INSERT INTO login_events (
         login_event_id, institution_key, user_id, attempted_email, event_type,
         outcome, reason, session_id, metadata
       )
       SELECT $1, $2, $3, users.email, 'PASSWORD_RESET', 'SUCCESS',
              'SELF_SERVICE_CHANGE', $4, '{}'::jsonb
       FROM users WHERE users.user_id = $3 AND users.institution_key = $2`,
      [randomUUID(), input.institutionKey, input.userId, input.sessionId],
    );

    return { changed: true, otherSessionsRevoked: true };
  });
}

export async function resetOperatorPassword(input: ResetOperatorPasswordInput) {
  const reason = input.reason.trim();
  if (!input.targetUserId) throw new Error("USER_ID_REQUIRED");
  if (!reason) throw new Error("RESET_REASON_REQUIRED");
  if (input.actorUserId === input.targetUserId) throw new Error("SELF_RESET_NOT_ALLOWED");
  validatePassword(input.temporaryPassword);

  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    await assertInstitutionAdministrator(client, input.institutionKey, input.actorUserId);

    const target = await client.query<{ user_id: string; email: string; status: string }>(
      `SELECT user_id, email, status
       FROM users
       WHERE institution_key = $1 AND user_id = $2
       LIMIT 1
       FOR UPDATE`,
      [input.institutionKey, input.targetUserId],
    );
    const user = target.rows[0];
    if (!user) throw new Error("USER_NOT_FOUND");
    if (user.status === "ARCHIVED") throw new Error("USER_ARCHIVED");

    const credentials = await client.query<CredentialRow>(
      `SELECT credential_id, secret_hash, hash_algorithm, hash_parameters, revoked_at
       FROM user_credentials
       WHERE user_id = $1 AND credential_type = 'PASSWORD'
       ORDER BY created_at DESC
       LIMIT $2
       FOR UPDATE`,
      [input.targetUserId, PASSWORD_HISTORY_LIMIT],
    );

    for (const credential of credentials.rows) {
      if (await passwordMatches(input.temporaryPassword, credential)) {
        throw new Error("PASSWORD_REUSE_NOT_ALLOWED");
      }
    }

    const record = await createPasswordRecord(input.temporaryPassword);
    const credentialId = randomUUID();

    await client.query(
      `UPDATE user_credentials
       SET revoked_at = COALESCE(revoked_at, NOW()), failed_attempts = 0,
           locked_until = NULL, updated_at = NOW()
       WHERE user_id = $1 AND credential_type = 'PASSWORD'`,
      [input.targetUserId],
    );

    await client.query(
      `INSERT INTO user_credentials (
         credential_id, user_id, credential_type, secret_hash, hash_algorithm,
         hash_parameters, password_changed_at, failed_attempts, locked_until
       ) VALUES ($1, $2, 'PASSWORD', $3, $4, $5::jsonb, NOW(), 0, NULL)`,
      [credentialId, input.targetUserId, record.secretHash, record.hashAlgorithm, JSON.stringify(record.hashParameters)],
    );

    await client.query(
      `UPDATE users
       SET metadata = jsonb_set(metadata, '{temporaryPassword}', 'true'::jsonb, true),
           updated_at = NOW()
       WHERE institution_key = $1 AND user_id = $2`,
      [input.institutionKey, input.targetUserId],
    );

    await client.query(
      `UPDATE sessions
       SET status = 'REVOKED', revoked_at = NOW(), revoked_by = $3,
           revoke_reason = 'ADMIN_PASSWORD_RESET', updated_at = NOW()
       WHERE institution_key = $1 AND user_id = $2 AND status = 'ACTIVE'`,
      [input.institutionKey, input.targetUserId, input.actorUserId],
    );

    await client.query(
      `INSERT INTO login_events (
         login_event_id, institution_key, user_id, attempted_email, event_type,
         outcome, reason, metadata
       ) VALUES ($1, $2, $3, $4, 'PASSWORD_RESET', 'SUCCESS', $5, $6::jsonb)`,
      [
        randomUUID(),
        input.institutionKey,
        input.targetUserId,
        user.email,
        reason,
        JSON.stringify({ resetBy: input.actorUserId }),
      ],
    );

    return {
      reset: true,
      userId: input.targetUserId,
      temporaryPasswordRequired: true,
      credentialsUnlocked: true,
      sessionsRevoked: true,
    };
  });
}

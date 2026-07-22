import { randomBytes, randomUUID, scrypt as scryptCallback, type ScryptOptions } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

const PASSWORD_KEY_LENGTH = 64;
const SCRYPT_PARAMETERS = { N: 16_384, r: 8, p: 1 };

export type CreateOperatorUserInput = {
  institutionKey: string;
  email: string;
  displayName?: string;
  temporaryPassword: string;
  actorUserId: string;
};

type UserListRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  status: string;
  email_verified_at: Date | string | null;
  created_at: Date | string;
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
      `SELECT user_id, email, display_name, status, email_verified_at, created_at
       FROM users
       WHERE institution_key = $1
       ORDER BY created_at DESC, email ASC`,
      [institutionKey],
    );
    return result.rows.map((row) => ({
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name ?? undefined,
      status: row.status,
      emailVerifiedAt: row.email_verified_at ? new Date(row.email_verified_at).toISOString() : undefined,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  });
}

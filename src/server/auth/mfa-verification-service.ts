import { createDecipheriv, createHmac, timingSafeEqual } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

const TOTP_DIGITS = 6;
const TOTP_PERIOD_SECONDS = 30;
const TOTP_WINDOW = 1;
const MFA_FAILURE_LIMIT = 5;
const MFA_LOCK_MINUTES = 15;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

type PendingMfaRow = {
  mfa_method_id: string;
  encrypted_secret: string;
  secret_iv: string;
  secret_auth_tag: string;
  failed_attempts: number;
  locked_until: Date | string | null;
};

export type ActivateTotpEnrollmentInput = {
  institutionKey: string;
  userId: string;
  code: string;
};

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

function getEncryptionKey(): Buffer {
  const configured = process.env.MFA_ENCRYPTION_KEY;
  if (!configured) throw new Error("MFA_ENCRYPTION_KEY_REQUIRED");

  const key = /^[0-9a-f]{64}$/i.test(configured)
    ? Buffer.from(configured, "hex")
    : Buffer.from(configured, "base64");

  if (key.length !== 32) throw new Error("MFA_ENCRYPTION_KEY_INVALID");
  return key;
}

function decryptSecret(row: PendingMfaRow): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(row.secret_iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(row.secret_auth_tag, "base64url"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(row.encrypted_secret, "base64url")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
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

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

function verifyTotp(secret: string, submittedCode: string, now = Date.now()): boolean {
  if (!/^\d{6}$/.test(submittedCode)) return false;

  const counter = Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);
  const supplied = Buffer.from(submittedCode, "utf8");

  for (let drift = -TOTP_WINDOW; drift <= TOTP_WINDOW; drift += 1) {
    const expected = Buffer.from(generateTotp(secret, counter + drift), "utf8");
    if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) return true;
  }

  return false;
}

function isLocked(lockedUntil: Date | string | null): boolean {
  return lockedUntil !== null && new Date(lockedUntil).getTime() > Date.now();
}

export async function activateTotpEnrollment(input: ActivateTotpEnrollmentInput) {
  const code = input.code.trim();
  if (!/^\d{6}$/.test(code)) throw new Error("MFA_CODE_INVALID_FORMAT");

  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const result = await client.query<PendingMfaRow>(
      `SELECT mfa_method_id, encrypted_secret, secret_iv, secret_auth_tag,
              failed_attempts, locked_until
       FROM user_mfa_methods
       WHERE institution_key = $1
         AND user_id = $2
         AND method_type = 'TOTP'
         AND status = 'PENDING'
       LIMIT 1
       FOR UPDATE`,
      [input.institutionKey, input.userId],
    );

    const enrollment = result.rows[0];
    if (!enrollment) throw new Error("MFA_ENROLLMENT_NOT_FOUND");
    if (isLocked(enrollment.locked_until)) throw new Error("MFA_ENROLLMENT_LOCKED");

    const secret = decryptSecret(enrollment);
    if (!verifyTotp(secret, code)) {
      const nextFailures = enrollment.failed_attempts + 1;
      await client.query(
        `UPDATE user_mfa_methods
         SET failed_attempts = $2,
             locked_until = CASE
               WHEN $2 >= $3 THEN NOW() + ($4 * INTERVAL '1 minute')
               ELSE NULL
             END,
             updated_at = NOW()
         WHERE mfa_method_id = $1`,
        [enrollment.mfa_method_id, nextFailures, MFA_FAILURE_LIMIT, MFA_LOCK_MINUTES],
      );

      throw new Error(nextFailures >= MFA_FAILURE_LIMIT ? "MFA_ENROLLMENT_LOCKED" : "MFA_CODE_INVALID");
    }

    await client.query(
      `UPDATE user_mfa_methods
       SET status = 'ACTIVE',
           verified_at = NOW(),
           last_used_at = NOW(),
           failed_attempts = 0,
           locked_until = NULL,
           updated_at = NOW()
       WHERE mfa_method_id = $1
         AND status = 'PENDING'`,
      [enrollment.mfa_method_id],
    );

    return {
      activated: true,
      mfaMethodId: enrollment.mfa_method_id,
      methodType: "TOTP" as const,
    };
  });
}

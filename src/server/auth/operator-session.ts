import type { NextRequest } from "next/server";
import { PostgresDatabase } from "../finance/postgres-database";
import {
  operatorSessionTtlSeconds,
  revokeOperatorToken,
  verifyOperatorToken,
} from "./identity-service";

export const OPERATOR_COOKIE = "sain_operator_session";

export async function verifyOperatorSession(token: string | undefined) {
  return verifyOperatorToken(token);
}

async function requiresPasswordChange(institutionKey: string, userId: string) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const result = await client.query<{ required: boolean }>(
      `SELECT COALESCE((metadata ->> 'temporaryPassword')::boolean, false) AS required
       FROM users
       WHERE institution_key = $1 AND user_id = $2
       LIMIT 1`,
      [institutionKey, userId],
    );
    return result.rows[0]?.required === true;
  });
}

export async function requireOperator(
  request: NextRequest,
  options: { allowPasswordChangeRequired?: boolean } = {},
) {
  const session = await verifyOperatorSession(request.cookies.get(OPERATOR_COOKIE)?.value);
  if (!session) throw new Error("AUTHENTICATION_REQUIRED");
  if (!options.allowPasswordChangeRequired && await requiresPasswordChange(session.institutionKey, session.userId)) {
    throw new Error("PASSWORD_CHANGE_REQUIRED");
  }
  return session;
}

export async function revokeOperatorSession(token: string | undefined, revokedBy?: string) {
  await revokeOperatorToken(token, revokedBy);
}

export function operatorCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: operatorSessionTtlSeconds(),
  };
}

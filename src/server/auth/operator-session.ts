import type { NextRequest } from "next/server";
import {
  operatorSessionTtlSeconds,
  revokeOperatorToken,
  verifyOperatorToken,
} from "./identity-service";

export const OPERATOR_COOKIE = "sain_operator_session";

export async function verifyOperatorSession(token: string | undefined) {
  return verifyOperatorToken(token);
}

export async function requireOperator(request: NextRequest) {
  const session = await verifyOperatorSession(request.cookies.get(OPERATOR_COOKIE)?.value);
  if (!session) throw new Error("AUTHENTICATION_REQUIRED");
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

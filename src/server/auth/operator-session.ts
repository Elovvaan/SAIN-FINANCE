import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const OPERATOR_COOKIE = "sain_operator_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

type OperatorSession = {
  email: string;
  role: "INSTITUTION_ADMIN";
  issuedAt: number;
  expiresAt: number;
};

function sessionSecret() {
  const secret = process.env.SAIN_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET_NOT_CONFIGURED");
  return secret;
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createOperatorSession(email: string) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const session: OperatorSession = {
    email,
    role: "INSTITUTION_ADMIN",
    issuedAt,
    expiresAt: issuedAt + SESSION_TTL_SECONDS,
  };
  const payload = encode(JSON.stringify(session));
  return `${payload}.${sign(payload)}`;
}

export function verifyOperatorSession(token: string | undefined): OperatorSession | null {
  if (!token) return null;
  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature) return null;

  const expectedSignature = sign(payload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const session = JSON.parse(decode(payload)) as OperatorSession;
    const now = Math.floor(Date.now() / 1000);
    if (session.role !== "INSTITUTION_ADMIN" || !session.email || session.expiresAt <= now) return null;
    return session;
  } catch {
    return null;
  }
}

export function requireOperator(request: NextRequest) {
  const session = verifyOperatorSession(request.cookies.get(OPERATOR_COOKIE)?.value);
  if (!session) throw new Error("AUTHENTICATION_REQUIRED");
  return session;
}

export function operatorCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

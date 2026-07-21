import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createOperatorSession, OPERATOR_COOKIE, operatorCookieOptions } from "@/server/auth/operator-session";

export const runtime = "nodejs";

function equalSecret(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function POST(request: NextRequest) {
  const configuredEmail = process.env.SAIN_ADMIN_EMAIL;
  const configuredPassword = process.env.SAIN_ADMIN_PASSWORD;
  const configuredSessionSecret = process.env.SAIN_SESSION_SECRET;
  if (
    !configuredEmail ||
    !configuredPassword ||
    configuredPassword.length < 12 ||
    !configuredSessionSecret ||
    configuredSessionSecret.length < 32
  ) {
    return NextResponse.json({ error: "OPERATOR_LOGIN_NOT_CONFIGURED" }, { status: 503 });
  }

  let body: { email?: unknown; password?: unknown };
  try {
    body = (await request.json()) as { email?: unknown; password?: unknown };
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const valid = equalSecret(email, configuredEmail.trim().toLowerCase()) && equalSecret(password, configuredPassword);
  if (!valid) return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });

  const response = NextResponse.json({ authenticated: true, role: "INSTITUTION_ADMIN" });
  response.cookies.set(OPERATOR_COOKIE, createOperatorSession(email), operatorCookieOptions());
  return response;
}

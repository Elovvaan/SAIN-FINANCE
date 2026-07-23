import { NextRequest, NextResponse } from "next/server";
import { completeMfaLogin } from "@/server/auth/mfa-login-completion-service";
import { OPERATOR_COOKIE, operatorCookieOptions } from "@/server/auth/operator-session";

export const runtime = "nodejs";

function requestMetadata(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return {
    sourceIp: forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || undefined,
    userAgent: request.headers.get("user-agent") || undefined,
    deviceId: request.headers.get("x-device-id") || undefined,
  };
}

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "MFA_LOGIN_UNAVAILABLE";
  if (code === "MFA_CHALLENGE_REQUIRED" || code === "MFA_CODE_INVALID_FORMAT") {
    return NextResponse.json({ error: code }, { status: 400 });
  }
  if (code === "MFA_CHALLENGE_INVALID" || code === "MFA_CHALLENGE_EXPIRED") {
    return NextResponse.json({ error: code }, { status: 401 });
  }
  if (code === "MFA_CODE_INVALID") {
    return NextResponse.json({ error: code }, { status: 401 });
  }
  if (code === "MFA_METHOD_LOCKED" || code === "MFA_LOGIN_BLOCKED") {
    return NextResponse.json({ error: code }, { status: 423 });
  }
  console.error("MFA_LOGIN_COMPLETION_FAILED", error);
  return NextResponse.json({ error: "MFA_LOGIN_UNAVAILABLE" }, { status: 503 });
}

export async function POST(request: NextRequest) {
  let body: { challengeToken?: unknown; code?: unknown };
  try {
    body = (await request.json()) as { challengeToken?: unknown; code?: unknown };
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  try {
    const completed = await completeMfaLogin(
      String(body.challengeToken || ""),
      String(body.code || ""),
      requestMetadata(request),
    );

    const response = NextResponse.json({
      authenticated: true,
      user: {
        id: completed.operator.userId,
        email: completed.operator.email,
        displayName: completed.operator.displayName,
        roles: completed.operator.roles,
        permissions: completed.operator.permissions,
      },
    });
    response.cookies.set(OPERATOR_COOKIE, completed.token, operatorCookieOptions());
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

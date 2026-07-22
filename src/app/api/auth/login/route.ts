import { NextRequest, NextResponse } from "next/server";
import { authenticateOperator } from "@/server/auth/identity-service";
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

export async function POST(request: NextRequest) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = (await request.json()) as { email?: unknown; password?: unknown };
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) {
    return NextResponse.json({ error: "EMAIL_AND_PASSWORD_REQUIRED" }, { status: 400 });
  }

  try {
    const authenticated = await authenticateOperator(email, password, requestMetadata(request));
    if (!authenticated) {
      return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
    }

    const response = NextResponse.json({
      authenticated: true,
      user: {
        id: authenticated.operator.userId,
        email: authenticated.operator.email,
        displayName: authenticated.operator.displayName,
        roles: authenticated.operator.roles,
        permissions: authenticated.operator.permissions,
      },
    });
    response.cookies.set(OPERATOR_COOKIE, authenticated.token, operatorCookieOptions());
    return response;
  } catch (error) {
    console.error("OPERATOR_LOGIN_FAILED", error);
    return NextResponse.json({ error: "OPERATOR_LOGIN_UNAVAILABLE" }, { status: 503 });
  }
}

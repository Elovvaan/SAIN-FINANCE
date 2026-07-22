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

    if ((authenticated as { mfaRequired?: boolean }).mfaRequired) {
      const challenge = authenticated as {
        mfaRequired: true;
        challengeToken: string;
        challengeExpiresAt: number;
        methodType: "TOTP";
      };
      return NextResponse.json(
        {
          authenticated: false,
          mfaRequired: true,
          challengeToken: challenge.challengeToken,
          challengeExpiresAt: challenge.challengeExpiresAt,
          methodType: challenge.methodType,
        },
        { status: 202 },
      );
    }

    const completed = authenticated as Exclude<typeof authenticated, { mfaRequired: true }>;
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
    console.error("OPERATOR_LOGIN_FAILED", error);
    return NextResponse.json({ error: "OPERATOR_LOGIN_UNAVAILABLE" }, { status: 503 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { authenticateOperator, operatorSessionTtlSeconds } from "@/server/auth/identity-service";
import { PLATFORM_SESSION_COOKIE } from "@/server/auth/platform-session";

export const runtime = "nodejs";

function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || undefined;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) return NextResponse.json({ error: "CREDENTIALS_REQUIRED" }, { status: 400 });

    const result = await authenticateOperator(email, password, {
      sourceIp: clientIp(request),
      userAgent: request.headers.get("user-agent") || undefined,
      deviceId: request.headers.get("x-device-id") || undefined,
    });

    if (!result || "mfaRequired" in result) {
      return NextResponse.json({ error: result && "mfaRequired" in result ? "MFA_REQUIRED" : "INVALID_CREDENTIALS" }, { status: 401 });
    }

    const response = NextResponse.json({ operator: result.operator });
    response.cookies.set(PLATFORM_SESSION_COOKIE, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: operatorSessionTtlSeconds(),
    });
    return response;
  } catch (error) {
    console.error("PLATFORM_LOGIN_FAILED", error);
    return NextResponse.json({ error: "PLATFORM_LOGIN_UNAVAILABLE" }, { status: 503 });
  }
}

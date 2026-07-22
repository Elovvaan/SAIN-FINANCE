import { NextRequest, NextResponse } from "next/server";
import { OPERATOR_COOKIE, verifyOperatorSession } from "@/server/auth/operator-session";

export async function GET(request: NextRequest) {
  const session = await verifyOperatorSession(request.cookies.get(OPERATOR_COOKIE)?.value);
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });

  return NextResponse.json({
    authenticated: true,
    user: {
      id: session.userId,
      email: session.email,
      displayName: session.displayName,
      roles: session.roles,
      permissions: session.permissions,
    },
    session: {
      id: session.sessionId,
      issuedAt: session.issuedAt,
      expiresAt: session.expiresAt,
    },
  });
}

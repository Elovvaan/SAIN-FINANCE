import { NextRequest, NextResponse } from "next/server";
import { OPERATOR_COOKIE, verifyOperatorSession } from "@/server/auth/operator-session";

export async function GET(request: NextRequest) {
  const session = verifyOperatorSession(request.cookies.get(OPERATOR_COOKIE)?.value);
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({ authenticated: true, email: session.email, role: session.role, expiresAt: session.expiresAt });
}

import { NextRequest, NextResponse } from "next/server";
import {
  OPERATOR_COOKIE,
  operatorCookieOptions,
  revokeOperatorSession,
  verifyOperatorSession,
} from "@/server/auth/operator-session";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(OPERATOR_COOKIE)?.value;
  const session = await verifyOperatorSession(token);
  await revokeOperatorSession(token, session?.userId);

  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(OPERATOR_COOKIE, "", { ...operatorCookieOptions(), maxAge: 0 });
  return response;
}

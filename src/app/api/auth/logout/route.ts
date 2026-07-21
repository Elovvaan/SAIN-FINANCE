import { NextResponse } from "next/server";
import { OPERATOR_COOKIE, operatorCookieOptions } from "@/server/auth/operator-session";

export async function POST() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(OPERATOR_COOKIE, "", { ...operatorCookieOptions(), maxAge: 0 });
  return response;
}

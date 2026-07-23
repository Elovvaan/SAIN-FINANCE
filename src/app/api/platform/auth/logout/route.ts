import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revokeOperatorToken } from "@/server/auth/identity-service";
import { PLATFORM_SESSION_COOKIE } from "@/server/auth/platform-session";

export const runtime = "nodejs";

export async function POST() {
  try {
    const store = await cookies();
    const token = store.get(PLATFORM_SESSION_COOKIE)?.value;
    await revokeOperatorToken(token);
    const response = NextResponse.json({ loggedOut: true });
    response.cookies.set(PLATFORM_SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    console.error("PLATFORM_LOGOUT_FAILED", error);
    return NextResponse.json({ error: "PLATFORM_LOGOUT_UNAVAILABLE" }, { status: 503 });
  }
}

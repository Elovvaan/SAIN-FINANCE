import { NextResponse } from "next/server";
import { currentPlatformOperator } from "@/server/auth/platform-session";

export const runtime = "nodejs";

export async function GET() {
  try {
    const operator = await currentPlatformOperator();
    if (!operator) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    return NextResponse.json({ operator });
  } catch (error) {
    console.error("PLATFORM_SESSION_FAILED", error);
    return NextResponse.json({ error: "PLATFORM_SESSION_UNAVAILABLE" }, { status: 503 });
  }
}

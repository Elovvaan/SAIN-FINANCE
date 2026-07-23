import { NextRequest, NextResponse } from "next/server";
import { currentPlatformOperator } from "@/server/auth/platform-session";
import { NotificationService } from "@/server/platform/notification-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const operator = await currentPlatformOperator();
    if (!operator) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    const limit = Number(request.nextUrl.searchParams.get("limit") || 50);
    const notifications = await NotificationService.list(operator.institutionKey, operator.userId, limit);
    return NextResponse.json({ notifications });
  } catch (error) {
    console.error("NOTIFICATIONS_LIST_FAILED", error);
    return NextResponse.json({ error: "NOTIFICATIONS_UNAVAILABLE" }, { status: 503 });
  }
}

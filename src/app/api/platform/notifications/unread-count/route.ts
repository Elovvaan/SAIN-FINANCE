import { NextResponse } from "next/server";
import { currentPlatformOperator } from "@/server/auth/platform-session";
import { NotificationService } from "@/server/platform/notification-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const operator = await currentPlatformOperator();
    if (!operator) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    const unreadCount = await NotificationService.unreadCount(operator.institutionKey, operator.userId);
    return NextResponse.json({ unreadCount });
  } catch (error) {
    console.error("NOTIFICATION_COUNT_FAILED", error);
    return NextResponse.json({ error: "NOTIFICATION_COUNT_UNAVAILABLE" }, { status: 503 });
  }
}

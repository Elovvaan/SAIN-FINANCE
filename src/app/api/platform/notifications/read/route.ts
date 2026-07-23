import { NextRequest, NextResponse } from "next/server";
import { currentPlatformOperator } from "@/server/auth/platform-session";
import { NotificationService } from "@/server/platform/notification-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const operator = await currentPlatformOperator();
    if (!operator) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const notificationIds = Array.isArray(body.notificationIds)
      ? body.notificationIds.filter((value: unknown): value is string => typeof value === "string")
      : [];
    if (!notificationIds.length) {
      return NextResponse.json({ error: "NOTIFICATION_IDS_REQUIRED" }, { status: 400 });
    }
    const updated = await NotificationService.markRead(operator.institutionKey, operator.userId, notificationIds);
    return NextResponse.json({ updated });
  } catch (error) {
    console.error("NOTIFICATION_READ_FAILED", error);
    return NextResponse.json({ error: "NOTIFICATION_UPDATE_UNAVAILABLE" }, { status: 503 });
  }
}

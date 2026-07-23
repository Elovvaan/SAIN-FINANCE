import { NextResponse } from "next/server";
import { currentPlatformOperator } from "@/server/auth/platform-session";
import { NotificationService } from "@/server/platform/notification-service";

export const runtime = "nodejs";

export async function POST() {
  try {
    const operator = await currentPlatformOperator();
    if (!operator) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    const updated = await NotificationService.markAllRead(operator.institutionKey, operator.userId);
    return NextResponse.json({ updated });
  } catch (error) {
    console.error("NOTIFICATION_READ_ALL_FAILED", error);
    return NextResponse.json({ error: "NOTIFICATION_UPDATE_UNAVAILABLE" }, { status: 503 });
  }
}

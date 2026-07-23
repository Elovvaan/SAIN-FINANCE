import { NextRequest, NextResponse } from "next/server";
import { currentPlatformOperator } from "@/server/auth/platform-session";
import { NotificationService } from "@/server/platform/notification-service";

export const runtime = "nodejs";

export async function PUT(request: NextRequest) {
  try {
    const operator = await currentPlatformOperator();
    if (!operator) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const preferences = Array.isArray(body.preferences)
      ? body.preferences.filter((value: unknown) => {
          if (!value || typeof value !== "object") return false;
          return typeof (value as { category?: unknown }).category === "string";
        })
      : [];
    if (!preferences.length) {
      return NextResponse.json({ error: "PREFERENCES_REQUIRED" }, { status: 400 });
    }
    const updated = await NotificationService.updatePreferences(
      operator.institutionKey,
      operator.userId,
      preferences,
    );
    return NextResponse.json({ updated });
  } catch (error) {
    console.error("NOTIFICATION_PREFERENCES_FAILED", error);
    return NextResponse.json({ error: "NOTIFICATION_PREFERENCES_UNAVAILABLE" }, { status: 503 });
  }
}

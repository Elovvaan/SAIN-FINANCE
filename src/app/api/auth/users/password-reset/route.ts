import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import { resetOperatorPassword } from "@/server/auth/password-service";

export const runtime = "nodejs";

function errorStatus(message: string) {
  if (message === "AUTHENTICATION_REQUIRED") return 401;
  if (message === "ROLE_ADMIN_REQUIRED") return 403;
  if (message === "USER_NOT_FOUND") return 404;
  if (message === "SELF_RESET_NOT_ALLOWED") return 409;
  if (message === "PASSWORD_REUSE_NOT_ALLOWED") return 409;
  if (message === "USER_ARCHIVED") return 409;
  return 400;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireOperator(request);
    const body = (await request.json()) as Record<string, unknown>;
    const result = await resetOperatorPassword({
      institutionKey: session.institutionKey,
      actorUserId: session.userId,
      targetUserId: String(body.userId || ""),
      temporaryPassword: String(body.temporaryPassword || ""),
      reason: String(body.reason || ""),
    });
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: errorStatus(message) });
  }
}

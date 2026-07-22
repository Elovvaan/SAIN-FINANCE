import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import { changeOperatorPassword } from "@/server/auth/password-service";

export const runtime = "nodejs";

function errorStatus(message: string) {
  if (message === "AUTHENTICATION_REQUIRED") return 401;
  if (message === "CURRENT_PASSWORD_INVALID") return 403;
  if (message === "PASSWORD_REUSE_NOT_ALLOWED") return 409;
  return 400;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireOperator(request, { allowPasswordChangeRequired: true });
    const body = (await request.json()) as Record<string, unknown>;
    const result = await changeOperatorPassword({
      institutionKey: session.institutionKey,
      userId: session.userId,
      sessionId: session.sessionId,
      currentPassword: String(body.currentPassword || ""),
      newPassword: String(body.newPassword || ""),
    });
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: errorStatus(message) });
  }
}

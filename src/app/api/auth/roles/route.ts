import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import {
  assignUserRole,
  revokeUserRole,
} from "@/server/auth/role-administration-service";

export const runtime = "nodejs";

function errorStatus(message: string) {
  if (message === "AUTHENTICATION_REQUIRED") return 401;
  if (message === "ROLE_ADMIN_REQUIRED") return 403;
  if (message.includes("NOT_FOUND")) return 404;
  if (message === "ROLE_ALREADY_ASSIGNED") return 409;
  return 400;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireOperator(request);
    const body = (await request.json()) as Record<string, unknown>;
    const result = await assignUserRole({
      institutionKey: session.institutionKey,
      targetUserId: String(body.targetUserId || ""),
      roleCode: String(body.roleCode || ""),
      actorUserId: session.userId,
      actorEmail: session.email,
      sessionId: session.sessionId,
      effectiveAt: body.effectiveAt ? String(body.effectiveAt) : undefined,
      expiresAt: body.expiresAt ? String(body.expiresAt) : undefined,
    });
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: errorStatus(message) });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireOperator(request);
    const body = (await request.json()) as Record<string, unknown>;
    const result = await revokeUserRole({
      institutionKey: session.institutionKey,
      userRoleId: String(body.userRoleId || ""),
      actorUserId: session.userId,
      actorEmail: session.email,
      sessionId: session.sessionId,
      reason: String(body.reason || ""),
    });
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: errorStatus(message) });
  }
}

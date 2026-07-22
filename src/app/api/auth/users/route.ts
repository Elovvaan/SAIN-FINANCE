import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import {
  createOperatorUser,
  listOperatorUsers,
} from "@/server/auth/user-administration-service";

export const runtime = "nodejs";

function errorStatus(message: string) {
  if (message === "AUTHENTICATION_REQUIRED") return 401;
  if (message === "ROLE_ADMIN_REQUIRED") return 403;
  if (message === "USER_ALREADY_EXISTS") return 409;
  return 400;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireOperator(request);
    const users = await listOperatorUsers(session.institutionKey, session.userId);
    return NextResponse.json({ users });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: errorStatus(message) });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireOperator(request);
    const body = (await request.json()) as Record<string, unknown>;
    const user = await createOperatorUser({
      institutionKey: session.institutionKey,
      email: String(body.email || ""),
      displayName: body.displayName ? String(body.displayName) : undefined,
      temporaryPassword: String(body.temporaryPassword || ""),
      actorUserId: session.userId,
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: errorStatus(message) });
  }
}

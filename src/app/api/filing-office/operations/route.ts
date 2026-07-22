import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import { runFilingOfficeOperation } from "@/server/finance/filing-office-service";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 256_000;

function operationErrorStatus(message: string) {
  if (message === "AUTHENTICATION_REQUIRED") return 401;
  if (
    message.startsWith("AUTHORITY_REQUIRED") ||
    message === "INVALID_BOOTSTRAP_TOKEN" ||
    message === "BOOTSTRAP_DISABLED" ||
    message === "BOOTSTRAP_SCOPE_RESTRICTED"
  ) {
    return 403;
  }
  if (message.includes("NOT_FOUND")) return 404;
  return 400;
}

export async function POST(request: NextRequest) {
  try {
    const session = requireOperator(request);
    const length = Number(request.headers.get("content-length") || 0);
    if (length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
    }
    if (!body.operation) {
      return NextResponse.json({ error: "MISSING_OPERATION" }, { status: 400 });
    }

    const result = await runFilingOfficeOperation({ ...body, actorId: session.email });
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: operationErrorStatus(message) });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { runFilingOfficeOperation } from "@/server/finance/filing-office";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 256_000;

export async function POST(request: NextRequest) {
  try {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    if (!body.operation) {
      return NextResponse.json({ error: "MISSING_OPERATION" }, { status: 400 });
    }

    const result = await runFilingOfficeOperation(body);
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = message.startsWith("AUTHORITY_REQUIRED") ? 403 : message.includes("NOT_FOUND") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

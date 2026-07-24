import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import { listApprovalEvents } from "@/server/approvals/approval-engine-service";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "APPROVAL_ENGINE_UNAVAILABLE";
  if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
  if (code === "PASSWORD_CHANGE_REQUIRED") return NextResponse.json({ error: code }, { status: 403 });
  if (code === "APPROVAL_NOT_FOUND") return NextResponse.json({ error: code }, { status: 404 });
  console.error("APPROVAL_ENGINE_HISTORY_FAILED", error);
  return NextResponse.json({ error: "APPROVAL_ENGINE_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ approvalId: string }> }) {
  try {
    const operator = await requireOperator(request);
    const { approvalId } = await params;
    const events = await listApprovalEvents(operator, approvalId);
    return NextResponse.json({ events });
  } catch (error) {
    return errorResponse(error);
  }
}

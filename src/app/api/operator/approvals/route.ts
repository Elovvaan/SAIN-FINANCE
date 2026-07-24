import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import { createApproval, listApprovals } from "@/server/approvals/approval-engine-service";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "APPROVAL_ENGINE_UNAVAILABLE";
  if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
  if (code === "PASSWORD_CHANGE_REQUIRED") return NextResponse.json({ error: code }, { status: 403 });
  if (code === "APPROVAL_DECISION_FORBIDDEN") return NextResponse.json({ error: code }, { status: 403 });
  if (code === "APPROVAL_NOT_FOUND") return NextResponse.json({ error: code }, { status: 404 });
  if (code.startsWith("APPROVAL_") && code !== "APPROVAL_ENGINE_UNAVAILABLE") return NextResponse.json({ error: code }, { status: 400 });
  console.error("APPROVAL_ENGINE_REQUEST_FAILED", error);
  return NextResponse.json({ error: "APPROVAL_ENGINE_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const approvals = await listApprovals(operator, request.nextUrl.searchParams.get("status") || "");
    return NextResponse.json({ approvals });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json();
    const approval = await createApproval(operator, body);
    return NextResponse.json({ approval }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

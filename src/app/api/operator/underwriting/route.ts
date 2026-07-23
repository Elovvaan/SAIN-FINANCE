import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import {
  createUnderwritingCase,
  getUnderwritingCaseDetail,
  listEligibleLoanPackages,
  listUnderwritingQueue,
  updateUnderwritingCase,
} from "@/server/underwriting/underwriting-workspace-service";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "UNDERWRITING_WORKSPACE_UNAVAILABLE";
  if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
  if (code === "PASSWORD_CHANGE_REQUIRED") return NextResponse.json({ error: code }, { status: 403 });
  if (["LOAN_NOT_FOUND", "UNDERWRITING_CASE_NOT_FOUND", "UNDERWRITING_CONDITION_NOT_FOUND"].includes(code)) {
    return NextResponse.json({ error: code }, { status: 404 });
  }
  if (code.startsWith("UNDERWRITING_") || code === "LOAN_NOT_FOUND") {
    return NextResponse.json({ error: code }, { status: 400 });
  }
  console.error("UNDERWRITING_WORKSPACE_REQUEST_FAILED", error);
  return NextResponse.json({ error: "UNDERWRITING_WORKSPACE_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const caseId = request.nextUrl.searchParams.get("caseId") || "";
    if (caseId) return NextResponse.json(await getUnderwritingCaseDetail(operator, caseId));
    const query = request.nextUrl.searchParams.get("q") || "";
    const [cases, eligibleLoans] = await Promise.all([
      listUnderwritingQueue(operator, query),
      listEligibleLoanPackages(operator),
    ]);
    return NextResponse.json({ cases, eligibleLoans });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    const result = await createUnderwritingCase({
      operator,
      loanPackageId: String(body.loanPackageId || ""),
      priority: String(body.priority || "NORMAL"),
      summary: String(body.summary || ""),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    const result = await updateUnderwritingCase({
      operator,
      underwritingCaseId: String(body.underwritingCaseId || ""),
      action: String(body.action || ""),
      riskScore: body.riskScore === null || body.riskScore === undefined || body.riskScore === "" ? null : Number(body.riskScore),
      recommendation: String(body.recommendation || ""),
      summary: String(body.summary || ""),
      conditionType: String(body.conditionType || ""),
      conditionTitle: String(body.conditionTitle || ""),
      conditionDescription: String(body.conditionDescription || ""),
      conditionId: String(body.conditionId || ""),
      conditionStatus: String(body.conditionStatus || ""),
      noteType: String(body.noteType || ""),
      noteText: String(body.noteText || ""),
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
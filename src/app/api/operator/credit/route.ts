import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import {
  createCreditDecision,
  listCreditDecisionQueue,
  listEligibleRecommendations,
  updateCreditDecision,
} from "@/server/credit/credit-approval-service";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "CREDIT_APPROVAL_UNAVAILABLE";
  if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
  if (code === "PASSWORD_CHANGE_REQUIRED") return NextResponse.json({ error: code }, { status: 403 });
  if (["CREDIT_DECISION_NOT_FOUND", "CREDIT_RECOMMENDATION_NOT_FOUND"].includes(code)) {
    return NextResponse.json({ error: code }, { status: 404 });
  }
  if (code.startsWith("CREDIT_")) return NextResponse.json({ error: code }, { status: 400 });
  console.error("CREDIT_APPROVAL_REQUEST_FAILED", error);
  return NextResponse.json({ error: "CREDIT_APPROVAL_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const query = request.nextUrl.searchParams.get("q") || "";
    const [decisions, eligibleRecommendations] = await Promise.all([
      listCreditDecisionQueue(operator, query),
      listEligibleRecommendations(operator),
    ]);
    return NextResponse.json({ decisions, eligibleRecommendations });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    const result = await createCreditDecision({
      operator,
      underwritingCaseId: String(body.underwritingCaseId || ""),
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
    const result = await updateCreditDecision({
      operator,
      creditDecisionId: String(body.creditDecisionId || ""),
      action: String(body.action || ""),
      decisionType: String(body.decisionType || ""),
      approvedAmount: body.approvedAmount === null || body.approvedAmount === undefined || body.approvedAmount === "" ? null : Number(body.approvedAmount),
      comments: String(body.comments || ""),
      finalConditions: String(body.finalConditions || ""),
      exceptionReason: String(body.exceptionReason || ""),
      authorityLevel: String(body.authorityLevel || ""),
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
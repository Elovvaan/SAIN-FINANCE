import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import {
  createAmlAlert,
  createComplianceCase,
  createComplianceProfile,
  createRiskItem,
  listComplianceWorkspace,
  updateComplianceItem,
} from "@/server/compliance/compliance-service";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "COMPLIANCE_UNAVAILABLE";
  if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
  if (code === "PASSWORD_CHANGE_REQUIRED") return NextResponse.json({ error: code }, { status: 403 });
  if (code.endsWith("_NOT_FOUND")) return NextResponse.json({ error: code }, { status: 404 });
  if (code.startsWith("COMPLIANCE_")) return NextResponse.json({ error: code }, { status: 400 });
  console.error("COMPLIANCE_REQUEST_FAILED", error);
  return NextResponse.json({ error: "COMPLIANCE_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const query = request.nextUrl.searchParams.get("q") || "";
    return NextResponse.json(await listComplianceWorkspace(operator, query));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    const entityType = String(body.entityType || "");

    if (entityType === "PROFILE") {
      return NextResponse.json(await createComplianceProfile({
        operator,
        customerId: String(body.customerId || ""),
        customerType: String(body.customerType || "INDIVIDUAL"),
        riskRating: String(body.riskRating || "MEDIUM"),
        beneficialOwnershipRequired: Boolean(body.beneficialOwnershipRequired),
        nextReviewDate: String(body.nextReviewDate || ""),
      }), { status: 201 });
    }

    if (entityType === "ALERT") {
      return NextResponse.json(await createAmlAlert({
        operator,
        customerId: String(body.customerId || "") || undefined,
        treasuryPaymentId: String(body.treasuryPaymentId || "") || undefined,
        servicingLoanId: String(body.servicingLoanId || "") || undefined,
        alertType: String(body.alertType || ""),
        severity: String(body.severity || "MEDIUM"),
        score: Number(body.score),
        summary: String(body.summary || ""),
      }), { status: 201 });
    }

    if (entityType === "CASE") {
      return NextResponse.json(await createComplianceCase({
        operator,
        customerId: String(body.customerId || "") || undefined,
        caseType: String(body.caseType || ""),
        priority: String(body.priority || "MEDIUM"),
        title: String(body.title || ""),
        description: String(body.description || ""),
        amlAlertId: String(body.amlAlertId || "") || undefined,
        dueDate: String(body.dueDate || "") || undefined,
      }), { status: 201 });
    }

    if (entityType === "RISK") {
      return NextResponse.json(await createRiskItem({
        operator,
        category: String(body.category || ""),
        title: String(body.title || ""),
        description: String(body.description || ""),
        likelihood: Number(body.likelihood),
        impact: Number(body.impact),
        residualScore: Number(body.residualScore),
        mitigationPlan: String(body.mitigationPlan || ""),
        reviewDate: String(body.reviewDate || "") || undefined,
      }), { status: 201 });
    }

    return NextResponse.json({ error: "COMPLIANCE_ENTITY_TYPE_INVALID" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    return NextResponse.json(await updateComplianceItem({
      operator,
      itemType: String(body.itemType || ""),
      itemId: String(body.itemId || ""),
      action: String(body.action || ""),
      notes: String(body.notes || ""),
      riskRating: String(body.riskRating || ""),
      cipStatus: String(body.cipStatus || ""),
      kycStatus: String(body.kycStatus || ""),
      sanctionsStatus: String(body.sanctionsStatus || ""),
      pepStatus: String(body.pepStatus || ""),
      nextReviewDate: String(body.nextReviewDate || ""),
    }));
  } catch (error) {
    return errorResponse(error);
  }
}
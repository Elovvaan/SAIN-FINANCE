import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import {
  boardServicingLoan,
  getServicingLoanDetail,
  listEligibleFundedLoans,
  listServicingLoans,
  updateServicingLoan,
} from "@/server/servicing/loan-servicing-service";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "SERVICING_UNAVAILABLE";
  if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
  if (code === "PASSWORD_CHANGE_REQUIRED") return NextResponse.json({ error: code }, { status: 403 });
  if (["SERVICING_LOAN_NOT_FOUND", "SERVICING_ELIGIBLE_LOAN_NOT_FOUND"].includes(code)) {
    return NextResponse.json({ error: code }, { status: 404 });
  }
  if (code.startsWith("SERVICING_")) return NextResponse.json({ error: code }, { status: 400 });
  console.error("SERVICING_REQUEST_FAILED", error);
  return NextResponse.json({ error: "SERVICING_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const servicingLoanId = request.nextUrl.searchParams.get("servicingLoanId") || "";
    if (servicingLoanId) return NextResponse.json(await getServicingLoanDetail(operator, servicingLoanId));
    const query = request.nextUrl.searchParams.get("q") || "";
    const [loans, eligibleLoans] = await Promise.all([
      listServicingLoans(operator, query),
      listEligibleFundedLoans(operator),
    ]);
    return NextResponse.json({ loans, eligibleLoans });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    const result = await boardServicingLoan({
      operator,
      loanPackageId: String(body.loanPackageId || ""),
      annualInterestRate: Number(body.annualInterestRate),
      termMonths: Number(body.termMonths),
      amortizationMonths: body.amortizationMonths === undefined || body.amortizationMonths === "" ? undefined : Number(body.amortizationMonths),
      originationDate: String(body.originationDate || ""),
      firstPaymentDate: String(body.firstPaymentDate || ""),
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
    const result = await updateServicingLoan({
      operator,
      servicingLoanId: String(body.servicingLoanId || ""),
      action: String(body.action || ""),
      paymentType: String(body.paymentType || ""),
      amount: body.amount === undefined || body.amount === "" ? undefined : Number(body.amount),
      effectiveDate: String(body.effectiveDate || ""),
      externalReference: String(body.externalReference || ""),
      notes: String(body.notes || ""),
      escrowType: String(body.escrowType || ""),
      payeeName: String(body.payeeName || ""),
      annualAmount: body.annualAmount === undefined || body.annualAmount === "" ? undefined : Number(body.annualAmount),
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
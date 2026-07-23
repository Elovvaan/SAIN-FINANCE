import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import { createLoanPackage, listLoanPackageOptions, listLoanPackages } from "@/server/loans/loan-package-repository-service";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "LOAN_REPOSITORY_UNAVAILABLE";
  if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
  if (code === "PASSWORD_CHANGE_REQUIRED") return NextResponse.json({ error: code }, { status: 403 });
  if (code === "CUSTOMER_NOT_FOUND") return NextResponse.json({ error: code }, { status: 404 });
  if (code.startsWith("LOAN_")) return NextResponse.json({ error: code }, { status: 400 });
  console.error("LOAN_REPOSITORY_REQUEST_FAILED", error);
  return NextResponse.json({ error: "LOAN_REPOSITORY_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const query = request.nextUrl.searchParams.get("q") || "";
    const [loans, options] = await Promise.all([
      listLoanPackages(operator, query),
      listLoanPackageOptions(operator),
    ]);
    return NextResponse.json({ loans, ...options });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    const result = await createLoanPackage({
      operator,
      primaryCustomerId: String(body.primaryCustomerId || ""),
      loanType: String(body.loanType || ""),
      purpose: String(body.purpose || ""),
      requestedAmount: Number(body.requestedAmount),
      currencyCode: String(body.currencyCode || "USD"),
      interestRate: body.interestRate === "" || body.interestRate === undefined ? null : Number(body.interestRate),
      termMonths: body.termMonths === "" || body.termMonths === undefined ? null : Number(body.termMonths),
      paymentFrequency: String(body.paymentFrequency || ""),
      paymentType: String(body.paymentType || ""),
      amortizationMonths: body.amortizationMonths === "" || body.amortizationMonths === undefined ? null : Number(body.amortizationMonths),
      balloonPayment: body.balloonPayment === true || body.balloonPayment === "true" || body.balloonPayment === "on",
      originationFee: body.originationFee === "" || body.originationFee === undefined ? 0 : Number(body.originationFee),
      closingCosts: body.closingCosts === "" || body.closingCosts === undefined ? 0 : Number(body.closingCosts),
      underwritingNotes: String(body.underwritingNotes || ""),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import {
  createTreasuryAccount,
  createTreasuryPayment,
  listTreasuryWorkspace,
  updateTreasuryPayment,
} from "@/server/treasury/treasury-service";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "TREASURY_UNAVAILABLE";
  if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
  if (code === "PASSWORD_CHANGE_REQUIRED") return NextResponse.json({ error: code }, { status: 403 });
  if (["TREASURY_PAYMENT_NOT_FOUND", "TREASURY_ACCOUNT_NOT_FOUND", "TREASURY_GL_ACCOUNT_NOT_FOUND"].includes(code)) {
    return NextResponse.json({ error: code }, { status: 404 });
  }
  if (code.startsWith("TREASURY_")) return NextResponse.json({ error: code }, { status: 400 });
  console.error("TREASURY_REQUEST_FAILED", error);
  return NextResponse.json({ error: "TREASURY_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    return NextResponse.json(await listTreasuryWorkspace(operator, request.nextUrl.searchParams.get("q") || ""));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    const resource = String(body.resource || "PAYMENT");
    if (resource === "ACCOUNT") {
      const result = await createTreasuryAccount({
        operator,
        accountNumber: String(body.accountNumber || ""),
        accountName: String(body.accountName || ""),
        accountType: String(body.accountType || ""),
        currencyCode: String(body.currencyCode || "USD"),
        glAccountId: String(body.glAccountId || ""),
        minimumBalance: body.minimumBalance === undefined || body.minimumBalance === "" ? undefined : Number(body.minimumBalance),
      });
      return NextResponse.json(result, { status: 201 });
    }
    const result = await createTreasuryPayment({
      operator,
      paymentType: String(body.paymentType || ""),
      direction: String(body.direction || ""),
      amount: Number(body.amount),
      currencyCode: String(body.currencyCode || "USD"),
      sourceTreasuryAccountId: String(body.sourceTreasuryAccountId || "") || undefined,
      destinationTreasuryAccountId: String(body.destinationTreasuryAccountId || "") || undefined,
      beneficiaryName: String(body.beneficiaryName || ""),
      beneficiaryReference: String(body.beneficiaryReference || ""),
      externalReference: String(body.externalReference || ""),
      requestedExecutionDate: String(body.requestedExecutionDate || ""),
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
    return NextResponse.json(await updateTreasuryPayment({
      operator,
      treasuryPaymentId: String(body.treasuryPaymentId || ""),
      action: String(body.action || ""),
      returnReason: String(body.returnReason || ""),
    }));
  } catch (error) {
    return errorResponse(error);
  }
}

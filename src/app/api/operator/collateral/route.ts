import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import { createCollateral, listCollateral, listCollateralCustomers } from "@/server/collateral/collateral-repository-service";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "COLLATERAL_REPOSITORY_UNAVAILABLE";
  if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
  if (code === "PASSWORD_CHANGE_REQUIRED") return NextResponse.json({ error: code }, { status: 403 });
  if (code === "CUSTOMER_NOT_FOUND") return NextResponse.json({ error: code }, { status: 404 });
  if (code.startsWith("COLLATERAL_")) return NextResponse.json({ error: code }, { status: 400 });
  console.error("COLLATERAL_REPOSITORY_REQUEST_FAILED", error);
  return NextResponse.json({ error: "COLLATERAL_REPOSITORY_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const query = request.nextUrl.searchParams.get("q") || "";
    const [collateral, customers] = await Promise.all([
      listCollateral(operator, query),
      listCollateralCustomers(operator),
    ]);
    return NextResponse.json({ collateral, customers });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    const result = await createCollateral({
      operator,
      customerId: String(body.customerId || ""),
      assetType: String(body.assetType || ""),
      title: String(body.title || ""),
      description: String(body.description || ""),
      identifier: String(body.identifier || ""),
      valuation: Number(body.valuation),
      currencyCode: String(body.currencyCode || "USD"),
      ownershipStatus: String(body.ownershipStatus || "UNVERIFIED"),
      repositoryStatus: String(body.repositoryStatus || "PENDING"),
      addressLine1: String(body.addressLine1 || ""),
      city: String(body.city || ""),
      stateRegion: String(body.stateRegion || ""),
      postalCode: String(body.postalCode || ""),
      county: String(body.county || ""),
      details: typeof body.details === "object" && body.details !== null ? body.details as Record<string, unknown> : {},
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

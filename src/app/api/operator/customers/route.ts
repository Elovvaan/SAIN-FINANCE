import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import { createCustomer, listCustomers } from "@/server/customers/customer-repository-service";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "CUSTOMER_REPOSITORY_UNAVAILABLE";
  if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
  if (code === "PASSWORD_CHANGE_REQUIRED") return NextResponse.json({ error: code }, { status: 403 });
  if (code.startsWith("CUSTOMER_") && code !== "CUSTOMER_REPOSITORY_UNAVAILABLE") {
    return NextResponse.json({ error: code }, { status: 400 });
  }
  console.error("CUSTOMER_REPOSITORY_REQUEST_FAILED", error);
  return NextResponse.json({ error: "CUSTOMER_REPOSITORY_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const customers = await listCustomers(operator, request.nextUrl.searchParams.get("q") || "");
    return NextResponse.json({ customers });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    const customer = await createCustomer({
      operator,
      customerType: String(body.customerType || "") as "INDIVIDUAL" | "BUSINESS",
      status: String(body.status || "PROSPECT") as "PROSPECT" | "ACTIVE" | "INACTIVE" | "DECLINED" | "ARCHIVED",
      displayName: String(body.displayName || ""),
      legalName: String(body.legalName || ""),
      firstName: String(body.firstName || ""),
      middleName: String(body.middleName || ""),
      lastName: String(body.lastName || ""),
      businessName: String(body.businessName || ""),
      email: String(body.email || ""),
      phone: String(body.phone || ""),
      taxIdLast4: String(body.taxIdLast4 || ""),
      dateOfBirth: String(body.dateOfBirth || ""),
      formationDate: String(body.formationDate || ""),
      addressLine1: String(body.addressLine1 || ""),
      addressLine2: String(body.addressLine2 || ""),
      city: String(body.city || ""),
      stateRegion: String(body.stateRegion || ""),
      postalCode: String(body.postalCode || ""),
      countryCode: String(body.countryCode || "US"),
      notes: String(body.notes || ""),
    });
    return NextResponse.json({ customer }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

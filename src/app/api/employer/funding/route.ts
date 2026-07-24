import { NextRequest, NextResponse } from "next/server";
import { currentPlatformOperator } from "@/server/auth/platform-session";
import { EmployerFundingService } from "@/server/finance/employer-funding-service";

export const runtime = "nodejs";

function allowed(operator: { permissions: string[]; roles: string[] }, permission: string) {
  return operator.permissions.includes(permission) || operator.roles.includes("INSTITUTION_ADMIN");
}

function statusFor(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.endsWith("_REQUIRED") || message.endsWith("_INVALID") || message === "EMPLOYER_FUNDING_ACCOUNTS_MUST_DIFFER") return 400;
  if (message === "EMPLOYER_FUNDING_ACCOUNT_NOT_FOUND" || message === "EMPLOYER_FUNDING_PROFILE_NOT_ACTIVE") return 422;
  return 500;
}

export async function GET(request: NextRequest) {
  const operator = await currentPlatformOperator();
  if (!operator) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  if (!allowed(operator, "EMPLOYER_FUNDING_POST")) return NextResponse.json({ error: "PERMISSION_REQUIRED" }, { status: 403 });

  const employerKey = request.nextUrl.searchParams.get("employerKey") || "";
  try {
    const [profile, events] = await Promise.all([
      EmployerFundingService.getProfile(operator, employerKey),
      EmployerFundingService.list(operator, employerKey),
    ]);
    return NextResponse.json({ profile, events });
  } catch (error) {
    const message = error instanceof Error ? error.message : "EMPLOYER_FUNDING_READ_FAILED";
    return NextResponse.json({ error: message }, { status: statusFor(error) });
  }
}

export async function PUT(request: NextRequest) {
  const operator = await currentPlatformOperator();
  if (!operator) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  if (!allowed(operator, "EMPLOYER_FUNDING_CONFIGURE")) return NextResponse.json({ error: "PERMISSION_REQUIRED" }, { status: 403 });

  try {
    const body = await request.json();
    const profile = await EmployerFundingService.configure({
      operator,
      employerKey: String(body.employerKey || ""),
      displayName: String(body.displayName || ""),
      cashGlAccountId: String(body.cashGlAccountId || ""),
      fundingLiabilityGlAccountId: String(body.fundingLiabilityGlAccountId || ""),
      metadata: body.metadata,
    });
    return NextResponse.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "EMPLOYER_FUNDING_CONFIGURATION_FAILED";
    return NextResponse.json({ error: message }, { status: statusFor(error) });
  }
}

export async function POST(request: NextRequest) {
  const operator = await currentPlatformOperator();
  if (!operator) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  if (!allowed(operator, "EMPLOYER_FUNDING_POST")) return NextResponse.json({ error: "PERMISSION_REQUIRED" }, { status: 403 });

  try {
    const body = await request.json();
    const event = await EmployerFundingService.post({
      operator,
      employerKey: String(body.employerKey || ""),
      idempotencyKey: String(body.idempotencyKey || ""),
      amount: Number(body.amount),
      accountingDate: String(body.accountingDate || ""),
      description: String(body.description || ""),
      metadata: body.metadata,
    });
    return NextResponse.json({ event }, { status: event.idempotentReplay ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "EMPLOYER_FUNDING_POST_FAILED";
    return NextResponse.json({ error: message }, { status: statusFor(error) });
  }
}

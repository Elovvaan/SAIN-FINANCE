import { NextResponse } from "next/server";
import { currentPlatformOperator } from "@/server/auth/platform-session";
import { FinancialPostingService } from "@/server/finance/financial-posting-service";

export const runtime = "nodejs";

type ReversalRequest = {
  originalJournalEntryId: string;
  idempotencyKey: string;
  accountingDate: string;
  description: string;
  metadata?: Record<string, unknown>;
};

function message(error: unknown) {
  return error instanceof Error ? error.message : "FINANCIAL_POSTING_REVERSAL_FAILED";
}

function statusFor(errorCode: string) {
  if (errorCode === "AUTHENTICATION_REQUIRED") return 401;
  if (errorCode === "FINANCIAL_POSTING_FORBIDDEN") return 403;
  if (errorCode.endsWith("_NOT_FOUND")) return 404;
  if (errorCode.startsWith("FINANCIAL_POSTING_")) return 400;
  return 500;
}

export async function POST(request: Request) {
  try {
    const operator = await currentPlatformOperator();
    if (!operator) throw new Error("AUTHENTICATION_REQUIRED");
    if (!operator.permissions.includes("FINANCIAL_POSTING_REVERSE")) {
      throw new Error("FINANCIAL_POSTING_FORBIDDEN");
    }

    const body = (await request.json()) as ReversalRequest;
    const result = await FinancialPostingService.reverse({
      ...body,
      operator: {
        institutionKey: operator.institutionKey,
        userId: operator.userId,
      },
    });

    return NextResponse.json({ posting: result }, { status: result.idempotentReplay ? 200 : 201 });
  } catch (error) {
    const errorCode = message(error);
    if (statusFor(errorCode) >= 500) console.error("FINANCIAL_POSTING_REVERSAL_API_FAILED", error);
    return NextResponse.json({ error: errorCode }, { status: statusFor(errorCode) });
  }
}

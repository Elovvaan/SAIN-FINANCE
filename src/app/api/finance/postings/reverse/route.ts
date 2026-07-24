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

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const originalJournalEntryId = String(body.originalJournalEntryId ?? "");
    if (!uuid.test(originalJournalEntryId)) throw new Error("FINANCIAL_POSTING_ORIGINAL_INVALID");

    const result = await FinancialPostingService.reverse({
      operator: {
        institutionKey: operator.institutionKey,
        userId: operator.userId,
      },
      originalJournalEntryId,
      idempotencyKey: String(body.idempotencyKey ?? ""),
      accountingDate: String(body.accountingDate ?? ""),
      description: String(body.description ?? ""),
      metadata:
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? (body.metadata as Record<string, unknown>)
          : undefined,
    });

    return NextResponse.json({ posting: result }, { status: result.idempotentReplay ? 200 : 201 });
  } catch (error) {
    const errorCode = message(error);
    if (statusFor(errorCode) >= 500) console.error("FINANCIAL_POSTING_REVERSAL_API_FAILED", error);
    return NextResponse.json({ error: errorCode }, { status: statusFor(errorCode) });
  }
}

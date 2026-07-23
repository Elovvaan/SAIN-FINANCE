import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import {
  createJournalEntry,
  createLedgerAccount,
  getJournalEntry,
  listLedgerWorkspace,
  updateJournalEntry,
} from "@/server/ledger/general-ledger-service";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "GL_UNAVAILABLE";
  if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
  if (code === "PASSWORD_CHANGE_REQUIRED") return NextResponse.json({ error: code }, { status: 403 });
  if (["GL_ENTRY_NOT_FOUND", "GL_ACCOUNT_NOT_FOUND"].includes(code)) return NextResponse.json({ error: code }, { status: 404 });
  if (code.startsWith("GL_")) return NextResponse.json({ error: code }, { status: 400 });
  console.error("GL_REQUEST_FAILED", error);
  return NextResponse.json({ error: "GL_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const journalEntryId = request.nextUrl.searchParams.get("journalEntryId") || "";
    if (journalEntryId) return NextResponse.json(await getJournalEntry(operator, journalEntryId));
    const query = request.nextUrl.searchParams.get("q") || "";
    return NextResponse.json(await listLedgerWorkspace(operator, query));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || "");
    if (action === "CREATE_ACCOUNT") {
      return NextResponse.json(await createLedgerAccount({
        operator,
        accountNumber: String(body.accountNumber || ""),
        accountName: String(body.accountName || ""),
        accountType: String(body.accountType || ""),
        normalBalance: String(body.normalBalance || ""),
      }), { status: 201 });
    }
    if (action === "CREATE_JOURNAL") {
      return NextResponse.json(await createJournalEntry({
        operator,
        sourceModule: String(body.sourceModule || "MANUAL"),
        sourceReference: String(body.sourceReference || ""),
        accountingDate: String(body.accountingDate || ""),
        description: String(body.description || ""),
        lines: Array.isArray(body.lines) ? body.lines as never[] : [],
      }), { status: 201 });
    }
    return NextResponse.json({ error: "GL_ACTION_INVALID" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const body = await request.json() as Record<string, unknown>;
    return NextResponse.json(await updateJournalEntry({
      operator,
      journalEntryId: String(body.journalEntryId || ""),
      action: String(body.action || ""),
    }));
  } catch (error) {
    return errorResponse(error);
  }
}

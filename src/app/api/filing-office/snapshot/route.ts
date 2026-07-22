import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import { getFilingOfficeSnapshot } from "@/server/finance/filing-office-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const memberView = request.nextUrl.searchParams.get("view") === "relationship";
    if (!memberView) await requireOperator(request);
    return NextResponse.json(await getFilingOfficeSnapshot(memberView));
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = message === "AUTHENTICATION_REQUIRED" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

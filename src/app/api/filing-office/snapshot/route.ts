import { NextRequest, NextResponse } from "next/server";
import { getFilingOfficeSnapshot } from "@/server/finance/filing-office";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const memberView = request.nextUrl.searchParams.get("view") === "relationship";
    return NextResponse.json(await getFilingOfficeSnapshot(memberView));
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

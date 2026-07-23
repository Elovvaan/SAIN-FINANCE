import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import { listDocumentEvents } from "@/server/documents/document-repository-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ documentId: string }> };

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "DOCUMENT_REPOSITORY_UNAVAILABLE";
  if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
  if (code === "PASSWORD_CHANGE_REQUIRED") return NextResponse.json({ error: code }, { status: 403 });
  if (code === "DOCUMENT_NOT_FOUND") return NextResponse.json({ error: code }, { status: 404 });
  console.error("DOCUMENT_EVENT_HISTORY_REQUEST_FAILED", error);
  return NextResponse.json({ error: "DOCUMENT_REPOSITORY_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const operator = await requireOperator(request);
    const { documentId } = await context.params;
    const events = await listDocumentEvents(operator, documentId);
    return NextResponse.json({ events });
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import { freezeDocumentVersion, getDocumentVersion } from "@/server/documents/document-repository-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ documentId: string }> };

function safeFilename(value: string) {
  return value.replace(/[\r\n"\\/]/g, "_");
}

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "DOCUMENT_REPOSITORY_UNAVAILABLE";
  if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
  if (code === "PASSWORD_CHANGE_REQUIRED") return NextResponse.json({ error: code }, { status: 403 });
  if (code === "DOCUMENT_VERSION_NOT_FOUND") return NextResponse.json({ error: code }, { status: 404 });
  if (code === "DOCUMENT_INTEGRITY_FAILURE") return NextResponse.json({ error: code }, { status: 409 });
  console.error("DOCUMENT_VERSION_REQUEST_FAILED", error);
  return NextResponse.json({ error: "DOCUMENT_REPOSITORY_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const operator = await requireOperator(request);
    const { documentId } = await context.params;
    const requestedVersion = request.nextUrl.searchParams.get("version");
    const versionNumber = requestedVersion ? Number(requestedVersion) : undefined;
    if (versionNumber !== undefined && (!Number.isInteger(versionNumber) || versionNumber <= 0)) {
      return NextResponse.json({ error: "DOCUMENT_VERSION_INVALID" }, { status: 400 });
    }

    const version = await getDocumentVersion(operator, documentId, versionNumber);
    const disposition = request.nextUrl.searchParams.get("disposition") === "inline" ? "inline" : "attachment";
    return new NextResponse(new Uint8Array(version.content), {
      headers: {
        "content-type": version.media_type,
        "content-length": String(version.byte_length),
        "content-disposition": `${disposition}; filename="${safeFilename(version.original_filename)}"`,
        "x-content-sha256": version.checksum_sha256,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const operator = await requireOperator(request);
    const { documentId } = await context.params;
    const body = await request.json() as { action?: unknown; versionNumber?: unknown };
    if (body.action !== "freeze") {
      return NextResponse.json({ error: "DOCUMENT_ACTION_INVALID" }, { status: 400 });
    }
    const versionNumber = Number(body.versionNumber);
    if (!Number.isInteger(versionNumber) || versionNumber <= 0) {
      return NextResponse.json({ error: "DOCUMENT_VERSION_INVALID" }, { status: 400 });
    }
    const result = await freezeDocumentVersion(operator, documentId, versionNumber);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

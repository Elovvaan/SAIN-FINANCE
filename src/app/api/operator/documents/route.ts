import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/server/auth/operator-session";
import { listDocuments, uploadDocumentVersion } from "@/server/documents/document-repository-service";

export const runtime = "nodejs";

function requestMetadata(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return {
    sourceIp: forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || undefined,
    userAgent: request.headers.get("user-agent") || undefined,
  };
}

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "DOCUMENT_REPOSITORY_UNAVAILABLE";
  if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
  if (code === "PASSWORD_CHANGE_REQUIRED") return NextResponse.json({ error: code }, { status: 403 });
  if (code === "DOCUMENT_NOT_FOUND") return NextResponse.json({ error: code }, { status: 404 });
  if (code.startsWith("DOCUMENT_") && code !== "DOCUMENT_REPOSITORY_UNAVAILABLE") {
    return NextResponse.json({ error: code }, { status: 400 });
  }
  console.error("DOCUMENT_REPOSITORY_REQUEST_FAILED", error);
  return NextResponse.json({ error: "DOCUMENT_REPOSITORY_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const documents = await listDocuments(operator, request.nextUrl.searchParams.get("q") || "");
    return NextResponse.json({ documents });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const operator = await requireOperator(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "DOCUMENT_FILE_REQUIRED" }, { status: 400 });
    }

    const maximumBytes = Number(process.env.SAIN_DOCUMENT_MAX_BYTES || 25 * 1024 * 1024);
    if (!Number.isFinite(maximumBytes) || maximumBytes <= 0) {
      throw new Error("DOCUMENT_REPOSITORY_UNAVAILABLE");
    }
    if (file.size > maximumBytes) {
      return NextResponse.json({ error: "DOCUMENT_FILE_TOO_LARGE", maximumBytes }, { status: 413 });
    }

    const uploaded = await uploadDocumentVersion({
      operator,
      documentId: String(form.get("documentId") || "").trim() || undefined,
      title: String(form.get("title") || ""),
      documentType: String(form.get("documentType") || ""),
      description: String(form.get("description") || ""),
      filename: file.name,
      mediaType: file.type || "application/octet-stream",
      content: Buffer.from(await file.arrayBuffer()),
      ...requestMetadata(request),
    });

    return NextResponse.json({ uploaded }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

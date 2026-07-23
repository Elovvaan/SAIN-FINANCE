import { NextRequest, NextResponse } from "next/server";
import { PostgresDatabase } from "@/server/finance/postgres-database";

export const runtime = "nodejs";

function required(value: unknown, code: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

export async function GET(request: NextRequest, context: { params: Promise<{ documentId: string }> }) {
  try {
    const email = required(request.nextUrl.searchParams.get("email"), "EMAIL_REQUIRED").toLowerCase();
    const { documentId } = await context.params;
    const database = new PostgresDatabase();
    const document = await database.transaction(async (client) => {
      const result = await client.query<{
        filename: string;
        media_type: string;
        content: Buffer;
      }>(
        `SELECT d.filename, d.media_type, d.content
         FROM worker_documents d
         JOIN career_profiles p ON p.career_profile_id = d.career_profile_id
         WHERE d.worker_document_id = $1
           AND p.email = $2
           AND d.status = 'ACTIVE'
         LIMIT 1`,
        [documentId, email],
      );
      return result.rows[0] || null;
    });
    if (!document) return NextResponse.json({ error: "WORKER_DOCUMENT_NOT_FOUND" }, { status: 404 });
    return new NextResponse(document.content, {
      headers: {
        "content-type": document.media_type,
        "content-disposition": `attachment; filename="${document.filename.replace(/"/g, "")}"`,
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "WORKER_DOCUMENT_UNAVAILABLE";
    if (code.endsWith("_REQUIRED")) return NextResponse.json({ error: code }, { status: 400 });
    console.error("WORKER_DOCUMENT_DOWNLOAD_FAILED", error);
    return NextResponse.json({ error: "WORKER_DOCUMENT_UNAVAILABLE" }, { status: 503 });
  }
}
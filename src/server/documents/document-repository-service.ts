import { createHash, randomUUID } from "node:crypto";
import { PostgresDatabase } from "../finance/postgres-database";

export type DocumentRepositoryOperator = {
  institutionKey: string;
  userId: string;
};

export type UploadDocumentInput = {
  operator: DocumentRepositoryOperator;
  documentId?: string;
  title: string;
  documentType: string;
  description?: string;
  filename: string;
  mediaType: string;
  content: Buffer;
  metadata?: Record<string, unknown>;
  sourceIp?: string;
  userAgent?: string;
};

function checksum(content: Buffer) {
  return createHash("sha256").update(content).digest("hex");
}

export async function uploadDocumentVersion(input: UploadDocumentInput) {
  if (!input.title.trim()) throw new Error("DOCUMENT_TITLE_REQUIRED");
  if (!input.documentType.trim()) throw new Error("DOCUMENT_TYPE_REQUIRED");
  if (!input.filename.trim()) throw new Error("DOCUMENT_FILENAME_REQUIRED");
  if (!input.content.length) throw new Error("DOCUMENT_CONTENT_REQUIRED");

  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const documentId = input.documentId || randomUUID();
    let versionNumber = 1;

    if (input.documentId) {
      const existing = await client.query<{ current_version: number; status: string }>(
        `SELECT current_version, status
         FROM repository_documents
         WHERE institution_key = $1 AND document_id = $2
         FOR UPDATE`,
        [input.operator.institutionKey, documentId],
      );
      const document = existing.rows[0];
      if (!document) throw new Error("DOCUMENT_NOT_FOUND");
      if (document.status !== "ACTIVE") throw new Error("DOCUMENT_ARCHIVED");
      versionNumber = document.current_version + 1;
    } else {
      await client.query(
        `INSERT INTO repository_documents (
           document_id, institution_key, title, document_type, description,
           current_version, created_by, updated_by, metadata
         ) VALUES ($1, $2, $3, $4, $5, 0, $6, $6, $7::jsonb)`,
        [
          documentId,
          input.operator.institutionKey,
          input.title.trim(),
          input.documentType.trim(),
          input.description?.trim() || null,
          input.operator.userId,
          JSON.stringify(input.metadata || {}),
        ],
      );
    }

    const digest = checksum(input.content);
    const byteLength = input.content.byteLength;
    const existingBlob = await client.query<{ blob_id: string }>(
      `SELECT blob_id FROM repository_document_blobs
       WHERE institution_key = $1 AND checksum_sha256 = $2 AND byte_length = $3
       LIMIT 1`,
      [input.operator.institutionKey, digest, byteLength],
    );

    const existingBlobId = existingBlob.rows[0]?.blob_id;
    const blobId: string = existingBlobId ?? randomUUID();

    if (!existingBlobId) {
      await client.query(
        `INSERT INTO repository_document_blobs (
           blob_id, institution_key, content, byte_length, checksum_sha256
         ) VALUES ($1, $2, $3, $4, $5)`,
        [blobId, input.operator.institutionKey, input.content, byteLength, digest],
      );
    }

    const documentVersionId = randomUUID();
    await client.query(
      `INSERT INTO repository_document_versions (
         document_version_id, institution_key, document_id, version_number, blob_id,
         original_filename, media_type, checksum_sha256, byte_length, created_by, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
      [
        documentVersionId,
        input.operator.institutionKey,
        documentId,
        versionNumber,
        blobId,
        input.filename.trim(),
        input.mediaType || "application/octet-stream",
        digest,
        byteLength,
        input.operator.userId,
        JSON.stringify(input.metadata || {}),
      ],
    );

    await client.query(
      `UPDATE repository_documents
       SET title = $3, document_type = $4, description = $5,
           current_version = $6, updated_by = $7, updated_at = NOW()
       WHERE institution_key = $1 AND document_id = $2`,
      [
        input.operator.institutionKey,
        documentId,
        input.title.trim(),
        input.documentType.trim(),
        input.description?.trim() || null,
        versionNumber,
        input.operator.userId,
      ],
    );

    await client.query(
      `INSERT INTO repository_document_events (
         event_id, institution_key, document_id, document_version_id,
         event_type, actor_user_id, source_ip, user_agent
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::inet, $8)`,
      [
        randomUUID(),
        input.operator.institutionKey,
        documentId,
        documentVersionId,
        versionNumber === 1 ? "DOCUMENT_CREATED" : "VERSION_UPLOADED",
        input.operator.userId,
        input.sourceIp || null,
        input.userAgent || null,
      ],
    );

    return { documentId, documentVersionId, versionNumber, checksumSha256: digest, byteLength };
  });
}

export async function listDocuments(operator: DocumentRepositoryOperator, query = "") {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const search = query.trim();
    const result = await client.query(
      `SELECT d.document_id, d.title, d.document_type, d.description, d.status,
              d.current_version, d.created_at, d.updated_at,
              v.original_filename, v.media_type, v.checksum_sha256,
              v.byte_length, v.frozen, v.signed_at
       FROM repository_documents d
       LEFT JOIN repository_document_versions v
         ON v.institution_key = d.institution_key
        AND v.document_id = d.document_id
        AND v.version_number = d.current_version
       WHERE d.institution_key = $1
         AND ($2 = '' OR to_tsvector('english', coalesce(d.title, '') || ' ' || coalesce(d.description, '') || ' ' || coalesce(d.document_type, ''))
              @@ plainto_tsquery('english', $2))
       ORDER BY d.updated_at DESC
       LIMIT 200`,
      [operator.institutionKey, search],
    );
    return result.rows;
  });
}

export async function getDocumentVersion(
  operator: DocumentRepositoryOperator,
  documentId: string,
  versionNumber?: number,
) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const result = await client.query<{
      document_version_id: string;
      original_filename: string;
      media_type: string;
      checksum_sha256: string;
      byte_length: string;
      content: Buffer;
    }>(
      `SELECT v.document_version_id, v.original_filename, v.media_type,
              v.checksum_sha256, v.byte_length, b.content
       FROM repository_documents d
       JOIN repository_document_versions v
         ON v.institution_key = d.institution_key AND v.document_id = d.document_id
       JOIN repository_document_blobs b ON b.blob_id = v.blob_id
       WHERE d.institution_key = $1 AND d.document_id = $2
         AND v.version_number = COALESCE($3, d.current_version)
       LIMIT 1`,
      [operator.institutionKey, documentId, versionNumber || null],
    );
    const version = result.rows[0];
    if (!version) throw new Error("DOCUMENT_VERSION_NOT_FOUND");
    if (checksum(version.content) !== version.checksum_sha256) throw new Error("DOCUMENT_INTEGRITY_FAILURE");
    return version;
  });
}

export async function freezeDocumentVersion(
  operator: DocumentRepositoryOperator,
  documentId: string,
  versionNumber: number,
) {
  const database = new PostgresDatabase();
  return database.transaction(async (client) => {
    const result = await client.query<{ document_version_id: string }>(
      `UPDATE repository_document_versions
       SET frozen = TRUE, frozen_at = COALESCE(frozen_at, NOW()),
           frozen_by = COALESCE(frozen_by, $4)
       WHERE institution_key = $1 AND document_id = $2 AND version_number = $3
       RETURNING document_version_id`,
      [operator.institutionKey, documentId, versionNumber, operator.userId],
    );
    if (!result.rows[0]) throw new Error("DOCUMENT_VERSION_NOT_FOUND");
    await client.query(
      `INSERT INTO repository_document_events (
         event_id, institution_key, document_id, document_version_id, event_type, actor_user_id
       ) VALUES ($1, $2, $3, $4, 'VERSION_FROZEN', $5)`,
      [randomUUID(), operator.institutionKey, documentId, result.rows[0].document_version_id, operator.userId],
    );
    return { frozen: true, documentId, versionNumber };
  });
}

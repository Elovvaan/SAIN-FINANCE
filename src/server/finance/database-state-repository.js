const SELECT_STATE = `
  SELECT state, revision
  FROM filing_office_state
  WHERE institution_key = $1
`;

const SELECT_STATE_FOR_UPDATE = `${SELECT_STATE.trimEnd()} FOR UPDATE`;

const SELECT_AUDIT = `
  SELECT event
  FROM filing_office_audit_events
  WHERE institution_key = $1
  ORDER BY occurred_at ASC, event_id ASC
`;

const SELECT_DOCUMENTS = `
  SELECT document_id, document_data
  FROM filing_office_documents
  WHERE institution_key = $1
  ORDER BY created_at ASC, document_id ASC
`;

const SELECT_DOCUMENT_VERSIONS = `
  SELECT document_id, version_data
  FROM filing_office_document_versions
  WHERE institution_key = $1
  ORDER BY document_id ASC, version_number ASC
`;

const INSERT_STATE = `
  INSERT INTO filing_office_state (
    institution_key,
    state,
    revision,
    created_at,
    updated_at
  ) VALUES ($1, $2::jsonb, 1, NOW(), NOW())
  RETURNING revision
`;

const UPDATE_STATE = `
  UPDATE filing_office_state
  SET state = $2::jsonb,
      revision = revision + 1,
      updated_at = NOW()
  WHERE institution_key = $1
    AND revision = $3
  RETURNING revision
`;

const INSERT_DOCUMENT = `
  INSERT INTO filing_office_documents (
    institution_key,
    document_id,
    owner_type,
    owner_id,
    package_id,
    document_type,
    title,
    status,
    template_class,
    source_verification_required,
    signed_by,
    verified_by,
    document_data,
    created_at,
    updated_at
  ) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, NOW(), NOW()
  )
`;

const UPDATE_DOCUMENT = `
  UPDATE filing_office_documents
  SET owner_type = $3,
      owner_id = $4,
      package_id = $5,
      document_type = $6,
      title = $7,
      status = $8,
      template_class = $9,
      source_verification_required = $10,
      signed_by = $11,
      verified_by = $12,
      document_data = $13::jsonb,
      updated_at = NOW()
  WHERE institution_key = $1
    AND document_id = $2
`;

const INSERT_AUDIT_EVENT = `
  INSERT INTO filing_office_audit_events (
    institution_key,
    event_id,
    actor_id,
    operation,
    target_id,
    occurred_at,
    previous_state,
    resulting_state,
    authority_id,
    event
  ) VALUES (
    $1, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9, $10::jsonb
  )
`;

const INSERT_DOCUMENT_VERSION = `
  INSERT INTO filing_office_document_versions (
    institution_key,
    document_id,
    version_number,
    content,
    checksum,
    created_at,
    created_by,
    frozen,
    version_data
  ) VALUES (
    $1, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9::jsonb
  )
`;

/**
 * Transitional SQL repository for the Filing Office aggregate.
 *
 * Phase 2B stores document metadata, document version history, and audit
 * history in normalized tables. The public repository contract and FilingState
 * domain shape remain unchanged.
 */
export class DatabaseStateRepository {
  constructor(options) {
    this.database = options.database;
    this.validate = options.validate;
    this.createInitialState = options.createInitialState;
    this.allowInitialState = options.allowInitialState ?? false;
    this.institutionKey = options.institutionKey ?? "sain-finance";
  }

  async load() {
    return this.database.transaction(async (client) => {
      const row = await this.readRow(client, false);
      if (row) return this.readHydratedState(client, row.state);
      if (this.allowInitialState) return this.createInitialState();
      throw new Error("STATE_STORE_UNAVAILABLE: database state not initialized");
    });
  }

  async save(state) {
    await this.database.transaction(async (client) => {
      const current = await this.readRow(client, true);
      const validated = this.validate(state);

      if (!current) {
        await this.insertState(client, validated);
        await this.insertDocuments(client, validated.documents);
        await this.insertAuditEvents(client, validated.audit);
        await this.insertDocumentVersions(client, flattenDocumentVersions(validated.documents));
        return;
      }

      const persisted = await this.readHydratedState(client, current.state);
      const documentChanges = reconcileDocuments(persisted.documents, validated.documents);
      const appendedAudit = assertAppendOnlyAudit(persisted.audit, validated.audit);
      const appendedVersions = assertAppendOnlyDocumentVersions(
        persisted.documents,
        validated.documents,
      );

      await this.updateState(client, validated, current.revision);
      await this.insertDocuments(client, documentChanges.inserted);
      await this.updateDocuments(client, documentChanges.updated);
      await this.insertAuditEvents(client, appendedAudit);
      await this.insertDocumentVersions(client, appendedVersions);
    });
  }

  async transact(callback) {
    return this.database.transaction(async (client) => {
      const current = await this.readRow(client, true);
      let state;
      let existingAudit = [];
      let existingDocuments = [];

      if (current) {
        state = await this.readHydratedState(client, current.state);
        existingAudit = structuredClone(state.audit);
        existingDocuments = structuredClone(state.documents);
      } else if (this.allowInitialState) {
        state = this.createInitialState();
      } else {
        throw new Error("STATE_STORE_UNAVAILABLE: database state not initialized");
      }

      const result = await callback(state);
      const validated = this.validate(state);
      const documentChanges = reconcileDocuments(existingDocuments, validated.documents);
      const appendedAudit = assertAppendOnlyAudit(existingAudit, validated.audit);
      const appendedVersions = assertAppendOnlyDocumentVersions(
        existingDocuments,
        validated.documents,
      );

      if (current) {
        await this.updateState(client, validated, current.revision);
      } else {
        await this.insertState(client, validated);
      }
      await this.insertDocuments(client, documentChanges.inserted);
      await this.updateDocuments(client, documentChanges.updated);
      await this.insertAuditEvents(client, appendedAudit);
      await this.insertDocumentVersions(client, appendedVersions);

      return result;
    });
  }

  async readRow(client, forUpdate) {
    const result = await client.query(
      forUpdate ? SELECT_STATE_FOR_UPDATE : SELECT_STATE,
      [this.institutionKey],
    );
    return result.rows[0];
  }

  async readHydratedState(client, storedState) {
    const [documentResult, auditResult, versionResult] = await Promise.all([
      client.query(SELECT_DOCUMENTS, [this.institutionKey]),
      client.query(SELECT_AUDIT, [this.institutionKey]),
      client.query(SELECT_DOCUMENT_VERSIONS, [this.institutionKey]),
    ]);

    const versionsByDocument = new Map();
    for (const row of versionResult.rows) {
      const versions = versionsByDocument.get(row.document_id) ?? [];
      versions.push(row.version_data);
      versionsByDocument.set(row.document_id, versions);
    }

    return this.validate({
      ...storedState,
      documents: documentResult.rows.map((row) => ({
        ...row.document_data,
        versions: versionsByDocument.get(row.document_id) ?? [],
      })),
      audit: auditResult.rows.map((row) => row.event),
    });
  }

  async insertState(client, state) {
    try {
      await client.query(INSERT_STATE, [
        this.institutionKey,
        JSON.stringify(withoutNormalizedCollections(state)),
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) throw new Error("STATE_WRITE_CONFLICT");
      throw error;
    }
  }

  async updateState(client, state, revision) {
    const result = await client.query(UPDATE_STATE, [
      this.institutionKey,
      JSON.stringify(withoutNormalizedCollections(state)),
      revision,
    ]);

    if ((result.rowCount ?? result.rows.length) !== 1) {
      throw new Error("STATE_WRITE_CONFLICT");
    }
  }

  async insertDocuments(client, documents) {
    for (const document of documents) {
      try {
        await client.query(INSERT_DOCUMENT, documentValues(this.institutionKey, document));
      } catch (error) {
        if (isUniqueViolation(error)) throw new Error("DOCUMENT_CONFLICT");
        throw error;
      }
    }
  }

  async updateDocuments(client, documents) {
    for (const document of documents) {
      const result = await client.query(
        UPDATE_DOCUMENT,
        documentValues(this.institutionKey, document),
      );
      if ((result.rowCount ?? result.rows.length) !== 1) {
        throw new Error("DOCUMENT_WRITE_CONFLICT");
      }
    }
  }

  async insertAuditEvents(client, events) {
    for (const event of events) {
      try {
        await client.query(INSERT_AUDIT_EVENT, [
          this.institutionKey,
          event.id,
          event.actorId,
          event.operation,
          event.targetId,
          event.at,
          event.previousState ?? null,
          event.resultingState ?? null,
          event.authorityId ?? null,
          JSON.stringify(event),
        ]);
      } catch (error) {
        if (isUniqueViolation(error)) throw new Error("AUDIT_EVENT_CONFLICT");
        throw error;
      }
    }
  }

  async insertDocumentVersions(client, entries) {
    for (const { documentId, version } of entries) {
      try {
        await client.query(INSERT_DOCUMENT_VERSION, [
          this.institutionKey,
          documentId,
          version.version,
          version.content,
          version.checksum,
          version.createdAt,
          version.createdBy,
          version.frozen,
          JSON.stringify(version),
        ]);
      } catch (error) {
        if (isUniqueViolation(error)) throw new Error("DOCUMENT_VERSION_CONFLICT");
        throw error;
      }
    }
  }
}

function withoutNormalizedCollections(state) {
  return {
    ...state,
    audit: [],
    documents: [],
  };
}

function documentValues(institutionKey, document) {
  return [
    institutionKey,
    document.id,
    document.ownerType,
    document.ownerId,
    document.packageId ?? null,
    document.type,
    document.title,
    document.status,
    document.templateClass,
    document.sourceVerificationRequired,
    document.signedBy ?? null,
    document.verifiedBy ?? null,
    JSON.stringify(withoutVersions(document)),
  ];
}

function withoutVersions(document) {
  const { versions: _versions, ...metadata } = document;
  return metadata;
}

function flattenDocumentVersions(documents) {
  return documents.flatMap((document) =>
    document.versions.map((version) => ({ documentId: document.id, version })),
  );
}

function reconcileDocuments(existingDocuments, nextDocuments) {
  const existingById = new Map(existingDocuments.map((document) => [document.id, document]));
  const nextById = new Map(nextDocuments.map((document) => [document.id, document]));
  const inserted = [];
  const updated = [];

  if (nextById.size !== nextDocuments.length) throw new Error("DOCUMENT_ID_CONFLICT");

  for (const existing of existingDocuments) {
    const next = nextById.get(existing.id);
    if (!next) throw new Error("DOCUMENT_DELETION_NOT_SUPPORTED");
    if (JSON.stringify(withoutVersions(existing)) !== JSON.stringify(withoutVersions(next))) {
      updated.push(next);
    }
  }

  for (const document of nextDocuments) {
    if (!existingById.has(document.id)) inserted.push(document);
  }

  return { inserted, updated };
}

function assertAppendOnlyAudit(existing, next) {
  if (next.length < existing.length) throw new Error("AUDIT_HISTORY_IMMUTABLE");

  for (let index = 0; index < existing.length; index += 1) {
    if (JSON.stringify(existing[index]) !== JSON.stringify(next[index])) {
      throw new Error("AUDIT_HISTORY_IMMUTABLE");
    }
  }

  return next.slice(existing.length);
}

function assertAppendOnlyDocumentVersions(existingDocuments, nextDocuments) {
  const nextById = new Map(nextDocuments.map((document) => [document.id, document]));
  const appended = [];

  for (const existingDocument of existingDocuments) {
    const nextDocument = nextById.get(existingDocument.id);
    if (!nextDocument) throw new Error("DOCUMENT_VERSION_HISTORY_IMMUTABLE");
    if (nextDocument.versions.length < existingDocument.versions.length) {
      throw new Error("DOCUMENT_VERSION_HISTORY_IMMUTABLE");
    }

    for (let index = 0; index < existingDocument.versions.length; index += 1) {
      if (
        JSON.stringify(existingDocument.versions[index]) !==
        JSON.stringify(nextDocument.versions[index])
      ) {
        throw new Error("DOCUMENT_VERSION_HISTORY_IMMUTABLE");
      }
    }

    for (let index = existingDocument.versions.length; index < nextDocument.versions.length; index += 1) {
      const version = nextDocument.versions[index];
      if (version.version !== index + 1) throw new Error("DOCUMENT_VERSION_SEQUENCE_INVALID");
      appended.push({ documentId: nextDocument.id, version });
    }

    nextById.delete(existingDocument.id);
  }

  for (const document of nextById.values()) {
    document.versions.forEach((version, index) => {
      if (version.version !== index + 1) throw new Error("DOCUMENT_VERSION_SEQUENCE_INVALID");
      appended.push({ documentId: document.id, version });
    });
  }

  return appended;
}

function isUniqueViolation(error) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505",
  );
}

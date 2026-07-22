const SELECT_STATE = `SELECT state, revision FROM filing_office_state WHERE institution_key = $1`;
const SELECT_STATE_FOR_UPDATE = `${SELECT_STATE} FOR UPDATE`;
const SELECT_AUDIT = `SELECT event FROM filing_office_audit_events WHERE institution_key = $1 ORDER BY occurred_at ASC, event_id ASC`;
const SELECT_DOCUMENTS = `SELECT document_id, document_order, document_data FROM filing_office_documents WHERE institution_key = $1 ORDER BY document_order ASC`;
const SELECT_DOCUMENT_VERSIONS = `SELECT document_id, version_data FROM filing_office_document_versions WHERE institution_key = $1 ORDER BY document_id ASC, version_number ASC`;
const SELECT_PACKAGES = `SELECT package_id, package_order, package_data FROM filing_office_packages WHERE institution_key = $1 ORDER BY package_order ASC`;
const SELECT_COLLATERAL = `SELECT collateral_id, collateral_order, collateral_data FROM filing_office_collateral WHERE institution_key = $1 ORDER BY collateral_order ASC`;
const SELECT_SUBMISSIONS = `SELECT submission_id, submission_order, submission_data FROM filing_office_submissions WHERE institution_key = $1 ORDER BY submission_order ASC`;

const INSERT_STATE = `
  INSERT INTO filing_office_state (institution_key, state, revision, created_at, updated_at)
  VALUES ($1, $2::jsonb, 1, NOW(), NOW())
  RETURNING revision
`;
const UPDATE_STATE = `
  UPDATE filing_office_state
  SET state = $2::jsonb, revision = revision + 1, updated_at = NOW()
  WHERE institution_key = $1 AND revision = $3
  RETURNING revision
`;
const INSERT_DOCUMENT = `
  INSERT INTO filing_office_documents (
    institution_key, document_id, document_order, owner_type, owner_id, package_id,
    document_type, title, status, template_class, source_verification_required,
    signed_by, verified_by, document_data, created_at, updated_at
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,NOW(),NOW())
`;
const UPDATE_DOCUMENT = `
  UPDATE filing_office_documents SET
    document_order=$3, owner_type=$4, owner_id=$5, package_id=$6,
    document_type=$7, title=$8, status=$9, template_class=$10,
    source_verification_required=$11, signed_by=$12, verified_by=$13,
    document_data=$14::jsonb, updated_at=NOW()
  WHERE institution_key=$1 AND document_id=$2
`;
const INSERT_PACKAGE = `
  INSERT INTO filing_office_packages (
    institution_key, package_id, package_order, owner_type, owner_id,
    package_type, status, completion_percentage, return_reason,
    package_data, created_at, updated_at
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,NOW(),NOW())
`;
const UPDATE_PACKAGE = `
  UPDATE filing_office_packages SET
    package_order=$3, owner_type=$4, owner_id=$5, package_type=$6,
    status=$7, completion_percentage=$8, return_reason=$9,
    package_data=$10::jsonb, updated_at=NOW()
  WHERE institution_key=$1 AND package_id=$2
`;
const INSERT_COLLATERAL = `
  INSERT INTO filing_office_collateral (
    institution_key, collateral_id, collateral_order, institution_id,
    description, amount, status, electronic, credit_card_receivable,
    third_party_custodian, created_at, withdrawn_at, collateral_data, updated_at
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::timestamptz,$12::timestamptz,$13::jsonb,NOW())
`;
const UPDATE_COLLATERAL = `
  UPDATE filing_office_collateral SET
    collateral_order=$3, institution_id=$4, description=$5, amount=$6,
    status=$7, electronic=$8, credit_card_receivable=$9,
    third_party_custodian=$10, created_at=$11::timestamptz,
    withdrawn_at=$12::timestamptz, collateral_data=$13::jsonb,
    updated_at=NOW()
  WHERE institution_key=$1 AND collateral_id=$2
`;
const INSERT_SUBMISSION = `
  INSERT INTO filing_office_submissions (
    institution_key, submission_id, submission_order, package_id,
    destination, submitted_at, submitted_by, status, reason,
    manifest, submission_data, created_at, updated_at
  ) VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7,$8,$9,$10::jsonb,$11::jsonb,NOW(),NOW())
`;
const UPDATE_SUBMISSION = `
  UPDATE filing_office_submissions SET
    submission_order=$3, package_id=$4, destination=$5,
    submitted_at=$6::timestamptz, submitted_by=$7, status=$8,
    reason=$9, manifest=$10::jsonb, submission_data=$11::jsonb,
    updated_at=NOW()
  WHERE institution_key=$1 AND submission_id=$2
`;
const INSERT_AUDIT_EVENT = `
  INSERT INTO filing_office_audit_events (
    institution_key, event_id, actor_id, operation, target_id, occurred_at,
    previous_state, resulting_state, authority_id, event
  ) VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7,$8,$9,$10::jsonb)
`;
const INSERT_DOCUMENT_VERSION = `
  INSERT INTO filing_office_document_versions (
    institution_key, document_id, version_number, content, checksum,
    created_at, created_by, frozen, version_data
  ) VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7,$8,$9::jsonb)
`;

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
        await this.insertDocuments(client, indexed(validated.documents));
        await this.insertPackages(client, indexed(validated.packages));
        await this.insertCollateral(client, indexed(validated.collateral));
        await this.insertSubmissions(client, indexed(validated.submissions));
        await this.insertAuditEvents(client, validated.audit);
        await this.insertDocumentVersions(client, flattenDocumentVersions(validated.documents));
        return;
      }

      const persisted = await this.readHydratedState(client, current.state);
      const documentChanges = reconcileCollection(persisted.documents, validated.documents, "DOCUMENT", withoutVersions);
      const packageChanges = reconcileCollection(persisted.packages, validated.packages, "PACKAGE", identity);
      const collateralChanges = reconcileCollection(persisted.collateral, validated.collateral, "COLLATERAL", identity);
      const submissionChanges = reconcileCollection(persisted.submissions, validated.submissions, "SUBMISSION", identity);
      const appendedAudit = assertAppendOnlyAudit(persisted.audit, validated.audit);
      const appendedVersions = assertAppendOnlyDocumentVersions(persisted.documents, validated.documents);

      await this.updateState(client, validated, current.revision);
      await this.persistMutableCollections(client, documentChanges, packageChanges, collateralChanges, submissionChanges);
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
      let existingPackages = [];
      let existingCollateral = [];
      let existingSubmissions = [];

      if (current) {
        state = await this.readHydratedState(client, current.state);
        existingAudit = structuredClone(state.audit);
        existingDocuments = structuredClone(state.documents);
        existingPackages = structuredClone(state.packages);
        existingCollateral = structuredClone(state.collateral);
        existingSubmissions = structuredClone(state.submissions);
      } else if (this.allowInitialState) {
        state = this.createInitialState();
      } else {
        throw new Error("STATE_STORE_UNAVAILABLE: database state not initialized");
      }

      const result = await callback(state);
      const validated = this.validate(state);
      const documentChanges = reconcileCollection(existingDocuments, validated.documents, "DOCUMENT", withoutVersions);
      const packageChanges = reconcileCollection(existingPackages, validated.packages, "PACKAGE", identity);
      const collateralChanges = reconcileCollection(existingCollateral, validated.collateral, "COLLATERAL", identity);
      const submissionChanges = reconcileCollection(existingSubmissions, validated.submissions, "SUBMISSION", identity);
      const appendedAudit = assertAppendOnlyAudit(existingAudit, validated.audit);
      const appendedVersions = assertAppendOnlyDocumentVersions(existingDocuments, validated.documents);

      if (current) await this.updateState(client, validated, current.revision);
      else await this.insertState(client, validated);
      await this.persistMutableCollections(client, documentChanges, packageChanges, collateralChanges, submissionChanges);
      await this.insertAuditEvents(client, appendedAudit);
      await this.insertDocumentVersions(client, appendedVersions);
      return result;
    });
  }

  async persistMutableCollections(client, documents, packages, collateral, submissions) {
    await this.insertDocuments(client, documents.inserted);
    await this.updateDocuments(client, documents.updated);
    await this.insertPackages(client, packages.inserted);
    await this.updatePackages(client, packages.updated);
    await this.insertCollateral(client, collateral.inserted);
    await this.updateCollateral(client, collateral.updated);
    await this.insertSubmissions(client, submissions.inserted);
    await this.updateSubmissions(client, submissions.updated);
  }

  async readRow(client, forUpdate) {
    const result = await client.query(forUpdate ? SELECT_STATE_FOR_UPDATE : SELECT_STATE, [this.institutionKey]);
    return result.rows[0];
  }

  async readHydratedState(client, storedState) {
    const [documentResult, packageResult, collateralResult, submissionResult, auditResult, versionResult] = await Promise.all([
      client.query(SELECT_DOCUMENTS, [this.institutionKey]),
      client.query(SELECT_PACKAGES, [this.institutionKey]),
      client.query(SELECT_COLLATERAL, [this.institutionKey]),
      client.query(SELECT_SUBMISSIONS, [this.institutionKey]),
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
      packages: packageResult.rows.map((row) => row.package_data),
      collateral: collateralResult.rows.map((row) => row.collateral_data),
      submissions: submissionResult.rows.map((row) => row.submission_data),
      audit: auditResult.rows.map((row) => row.event),
    });
  }

  async insertState(client, state) {
    try {
      await client.query(INSERT_STATE, [this.institutionKey, JSON.stringify(withoutNormalizedCollections(state))]);
    } catch (error) {
      if (isUniqueViolation(error)) throw new Error("STATE_WRITE_CONFLICT");
      throw error;
    }
  }

  async updateState(client, state, revision) {
    const result = await client.query(UPDATE_STATE, [this.institutionKey, JSON.stringify(withoutNormalizedCollections(state)), revision]);
    if ((result.rowCount ?? result.rows.length) !== 1) throw new Error("STATE_WRITE_CONFLICT");
  }

  async insertDocuments(client, entries) { await this.insertRows(client, entries, INSERT_DOCUMENT, documentValues, "DOCUMENT_CONFLICT"); }
  async updateDocuments(client, entries) { await this.updateRows(client, entries, UPDATE_DOCUMENT, documentValues, "DOCUMENT_WRITE_CONFLICT"); }
  async insertPackages(client, entries) { await this.insertRows(client, entries, INSERT_PACKAGE, packageValues, "PACKAGE_CONFLICT"); }
  async updatePackages(client, entries) { await this.updateRows(client, entries, UPDATE_PACKAGE, packageValues, "PACKAGE_WRITE_CONFLICT"); }
  async insertCollateral(client, entries) { await this.insertRows(client, entries, INSERT_COLLATERAL, collateralValues, "COLLATERAL_CONFLICT"); }
  async updateCollateral(client, entries) { await this.updateRows(client, entries, UPDATE_COLLATERAL, collateralValues, "COLLATERAL_WRITE_CONFLICT"); }
  async insertSubmissions(client, entries) { await this.insertRows(client, entries, INSERT_SUBMISSION, submissionValues, "SUBMISSION_CONFLICT"); }
  async updateSubmissions(client, entries) { await this.updateRows(client, entries, UPDATE_SUBMISSION, submissionValues, "SUBMISSION_WRITE_CONFLICT"); }

  async insertRows(client, entries, sql, valuesFactory, conflictCode) {
    for (const entry of entries) {
      try {
        await client.query(sql, valuesFactory(this.institutionKey, entry));
      } catch (error) {
        if (isUniqueViolation(error)) throw new Error(conflictCode);
        throw error;
      }
    }
  }

  async updateRows(client, entries, sql, valuesFactory, conflictCode) {
    for (const entry of entries) {
      const result = await client.query(sql, valuesFactory(this.institutionKey, entry));
      if ((result.rowCount ?? result.rows.length) !== 1) throw new Error(conflictCode);
    }
  }

  async insertAuditEvents(client, events) {
    for (const event of events) {
      try {
        await client.query(INSERT_AUDIT_EVENT, [
          this.institutionKey, event.id, event.actorId, event.operation, event.targetId,
          event.at, event.previousState ?? null, event.resultingState ?? null,
          event.authorityId ?? null, JSON.stringify(event),
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
          this.institutionKey, documentId, version.version, version.content,
          version.checksum, version.createdAt, version.createdBy, version.frozen,
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
  return { ...state, audit: [], documents: [], packages: [], collateral: [], submissions: [] };
}

function indexed(items) {
  return items.map((item, index) => ({ item, index }));
}

function documentValues(institutionKey, { item: document, index }) {
  return [
    institutionKey, document.id, index, document.ownerType, document.ownerId,
    document.packageId ?? null, document.type, document.title, document.status,
    document.templateClass, document.sourceVerificationRequired,
    document.signedBy ?? null, document.verifiedBy ?? null,
    JSON.stringify(withoutVersions(document)),
  ];
}

function packageValues(institutionKey, { item: packageItem, index }) {
  return [
    institutionKey, packageItem.id, index, packageItem.ownerType, packageItem.ownerId,
    packageItem.type, packageItem.status, packageItem.completionPercentage,
    packageItem.returnReason ?? null, JSON.stringify(packageItem),
  ];
}

function collateralValues(institutionKey, { item: collateral, index }) {
  return [
    institutionKey, collateral.id, index, collateral.institutionId,
    collateral.description, collateral.amount, collateral.status,
    collateral.electronic, collateral.creditCardReceivable,
    collateral.thirdPartyCustodian, collateral.createdAt,
    collateral.withdrawnAt ?? null, JSON.stringify(collateral),
  ];
}

function submissionValues(institutionKey, { item: submission, index }) {
  return [
    institutionKey, submission.id, index, submission.packageId,
    submission.destination, submission.submittedAt, submission.submittedBy,
    submission.status, submission.reason ?? null,
    JSON.stringify(submission.manifest), JSON.stringify(submission),
  ];
}

function withoutVersions(document) {
  const { versions: _versions, ...metadata } = document;
  return metadata;
}

function identity(value) { return value; }

function flattenDocumentVersions(documents) {
  return documents.flatMap((document) => document.versions.map((version) => ({ documentId: document.id, version })));
}

function reconcileCollection(existingItems, nextItems, label, comparable) {
  const existingById = new Map(existingItems.map((item, index) => [item.id, { item, index }]));
  const nextById = new Map(nextItems.map((item, index) => [item.id, { item, index }]));
  if (nextById.size !== nextItems.length) throw new Error(`${label}_ID_CONFLICT`);
  const inserted = [];
  const updated = [];
  for (const [id, existing] of existingById) {
    const next = nextById.get(id);
    if (!next) throw new Error(`${label}_DELETION_NOT_SUPPORTED`);
    if (existing.index !== next.index || JSON.stringify(comparable(existing.item)) !== JSON.stringify(comparable(next.item))) {
      updated.push(next);
    }
  }
  for (const [id, next] of nextById) if (!existingById.has(id)) inserted.push(next);
  return { inserted, updated };
}

function assertAppendOnlyAudit(existing, next) {
  if (next.length < existing.length) throw new Error("AUDIT_HISTORY_IMMUTABLE");
  for (let index = 0; index < existing.length; index += 1) {
    if (JSON.stringify(existing[index]) !== JSON.stringify(next[index])) throw new Error("AUDIT_HISTORY_IMMUTABLE");
  }
  return next.slice(existing.length);
}

function assertAppendOnlyDocumentVersions(existingDocuments, nextDocuments) {
  const nextById = new Map(nextDocuments.map((document) => [document.id, document]));
  const appended = [];
  for (const existingDocument of existingDocuments) {
    const nextDocument = nextById.get(existingDocument.id);
    if (!nextDocument || nextDocument.versions.length < existingDocument.versions.length) {
      throw new Error("DOCUMENT_VERSION_HISTORY_IMMUTABLE");
    }
    for (let index = 0; index < existingDocument.versions.length; index += 1) {
      if (JSON.stringify(existingDocument.versions[index]) !== JSON.stringify(nextDocument.versions[index])) {
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
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}

import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseStateRepository } from "../src/server/finance/database-state-repository.js";

const audit = (id) => ({ id, actorId: "actor-1", operation: "TEST", targetId: "target-1", at: "2026-07-22T12:00:00.000Z" });
const version = (number) => ({ version: number, content: `content-${number}`, checksum: `checksum-${number}`, createdAt: `2026-07-22T12:0${number}:00.000Z`, createdBy: "actor-1", frozen: false });
const document = (id = "document-1", versions = []) => ({ id, ownerType: "INSTITUTION", ownerId: "institution-1", packageId: "package-1", type: "OC10", title: `Document ${id}`, status: "GENERATED", templateClass: "SAIN_INTERNAL_TEMPLATE", sourceVerificationRequired: false, versions });
const packageItem = (id = "package-1") => ({ id, ownerType: "INSTITUTION", ownerId: "institution-1", type: "BIC_APPLICATION", status: "ASSEMBLING", requiredDocumentTypes: ["OC10"], conditionalDocumentTypes: [], documentIds: [], completionPercentage: 0, submissionIds: [] });
const collateral = (id = "collateral-1") => ({ id, institutionId: "institution-1", description: `Collateral ${id}`, amount: 1000, status: "PLEDGED", electronic: false, creditCardReceivable: false, thirdPartyCustodian: false, createdAt: "2026-07-22T12:00:00.000Z" });
const submission = (id = "submission-1") => ({ id, packageId: "package-1", destination: "Federal Reserve Bank", manifest: [{ documentId: "document-1", version: 1, checksum: "checksum-1" }], submittedAt: "2026-07-22T12:30:00.000Z", submittedBy: "actor-1", status: "SUBMITTED" });
const authority = (id = "authority-1") => ({ id, actorId: "actor-1", scope: "INSTITUTION_ADMIN", status: "ACTIVE", effectiveAt: "2026-07-22T12:00:00.000Z" });

function state(items = []) {
  return { schemaVersion: 1, items, audit: [], documents: [], packages: [], collateral: [], submissions: [], authorities: [] };
}

function validate(value) {
  if (!value || value.schemaVersion !== 1) throw new Error("INVALID_STATE");
  for (const key of ["audit", "documents", "packages", "collateral", "submissions", "authorities"]) {
    if (!Array.isArray(value[key])) throw new Error("INVALID_COLLECTIONS");
  }
  return structuredClone(value);
}

function withoutVersions(item) {
  const { versions: _versions, ...metadata } = item;
  return metadata;
}

function uniqueError(message) {
  const error = new Error(message);
  error.code = "23505";
  return error;
}

class FakeDatabase {
  constructor({ row, auditEvents = [], documents = [], packages = [], collateralRecords = [], submissions = [], authorities = [], versions = [] } = {}) {
    this.row = row ? structuredClone(row) : undefined;
    this.audit = structuredClone(auditEvents);
    this.documents = this.wrap(documents.map(withoutVersions));
    this.packages = this.wrap(packages);
    this.collateral = this.wrap(collateralRecords);
    this.submissions = this.wrap(submissions);
    this.authorities = this.wrap(authorities);
    this.versions = structuredClone(versions);
    this.queue = Promise.resolve();
  }

  wrap(items) {
    return items.map((item, order) => ({ order, data: structuredClone(item) }));
  }

  transaction(callback) {
    const run = this.queue.then(async () => {
      const snapshot = structuredClone({
        row: this.row,
        audit: this.audit,
        documents: this.documents,
        packages: this.packages,
        collateral: this.collateral,
        submissions: this.submissions,
        authorities: this.authorities,
        versions: this.versions,
      });
      try {
        return await callback({ query: (text, values = []) => this.query(text, values) });
      } catch (error) {
        Object.assign(this, snapshot);
        throw error;
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async query(text, values) {
    if (text.includes("SELECT state, revision")) return { rows: this.row ? [structuredClone(this.row)] : [], rowCount: this.row ? 1 : 0 };
    if (text.includes("SELECT document_id, document_order, document_data")) return this.select(this.documents, "document_id", "document_order", "document_data");
    if (text.includes("SELECT package_id, package_order, package_data")) return this.select(this.packages, "package_id", "package_order", "package_data");
    if (text.includes("SELECT collateral_id, collateral_order, collateral_data")) return this.select(this.collateral, "collateral_id", "collateral_order", "collateral_data");
    if (text.includes("SELECT submission_id, submission_order, submission_data")) return this.select(this.submissions, "submission_id", "submission_order", "submission_data");
    if (text.includes("SELECT authority_id, authority_order, authority_data")) return this.select(this.authorities, "authority_id", "authority_order", "authority_data");
    if (text.includes("SELECT event") && text.includes("filing_office_audit_events")) return { rows: this.audit.map((event) => ({ event: structuredClone(event) })), rowCount: this.audit.length };
    if (text.includes("SELECT document_id, version_data")) {
      const rows = this.versions.slice().sort((a, b) => a.documentId.localeCompare(b.documentId) || a.version.version - b.version.version).map((entry) => ({ document_id: entry.documentId, version_data: structuredClone(entry.version) }));
      return { rows, rowCount: rows.length };
    }
    if (text.includes("INSERT INTO filing_office_state")) {
      if (this.row) throw uniqueError("duplicate state");
      this.row = { state: JSON.parse(values[1]), revision: 1 };
      return { rows: [{ revision: 1 }], rowCount: 1 };
    }
    if (text.includes("UPDATE filing_office_state")) {
      if (!this.row || this.row.revision !== values[2]) return { rows: [], rowCount: 0 };
      this.row = { state: JSON.parse(values[1]), revision: this.row.revision + 1 };
      return { rows: [{ revision: this.row.revision }], rowCount: 1 };
    }
    if (text.includes("INSERT INTO filing_office_documents")) return this.insert(this.documents, values, 13, "document");
    if (text.includes("UPDATE filing_office_documents")) return this.update(this.documents, values, 13);
    if (text.includes("INSERT INTO filing_office_packages")) return this.insert(this.packages, values, 9, "package");
    if (text.includes("UPDATE filing_office_packages")) return this.update(this.packages, values, 9);
    if (text.includes("INSERT INTO filing_office_collateral")) return this.insert(this.collateral, values, 12, "collateral");
    if (text.includes("UPDATE filing_office_collateral")) return this.update(this.collateral, values, 12);
    if (text.includes("INSERT INTO filing_office_submissions")) return this.insert(this.submissions, values, 10, "submission");
    if (text.includes("UPDATE filing_office_submissions")) return this.update(this.submissions, values, 10);
    if (text.includes("INSERT INTO filing_office_authorities")) return this.insert(this.authorities, values, 8, "authority");
    if (text.includes("UPDATE filing_office_authorities")) return this.update(this.authorities, values, 8);
    if (text.includes("INSERT INTO filing_office_audit_events")) {
      if (this.audit.some((event) => event.id === values[1])) throw uniqueError("duplicate audit");
      this.audit.push(JSON.parse(values[9]));
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("INSERT INTO filing_office_document_versions")) {
      if (this.versions.some((entry) => entry.documentId === values[1] && entry.version.version === values[2])) throw uniqueError("duplicate version");
      this.versions.push({ documentId: values[1], version: JSON.parse(values[8]) });
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`UNEXPECTED_SQL: ${text}`);
  }

  select(collection, idKey, orderKey, dataKey) {
    const rows = collection.slice().sort((a, b) => a.order - b.order).map((entry) => ({ [idKey]: entry.data.id, [orderKey]: entry.order, [dataKey]: structuredClone(entry.data) }));
    return { rows, rowCount: rows.length };
  }

  insert(collection, values, jsonIndex, label) {
    if (collection.some((entry) => entry.data.id === values[1])) throw uniqueError(`duplicate ${label}`);
    collection.push({ order: values[2], data: JSON.parse(values[jsonIndex]) });
    return { rows: [], rowCount: 1 };
  }

  update(collection, values, jsonIndex) {
    const index = collection.findIndex((entry) => entry.data.id === values[1]);
    if (index < 0) return { rows: [], rowCount: 0 };
    collection[index] = { order: values[2], data: JSON.parse(values[jsonIndex]) };
    return { rows: [], rowCount: 1 };
  }
}

function repository(database, allowInitialState = false) {
  return new DatabaseStateRepository({ database, validate, createInitialState: () => state(), allowInitialState, institutionKey: "test-institution" });
}

test("repository fails closed when database state is missing", async () => {
  await assert.rejects(() => repository(new FakeDatabase()).load(), /STATE_STORE_UNAVAILABLE/);
});

test("initial state and all normalized collections commit together", async () => {
  const database = new FakeDatabase();
  const repo = repository(database, true);
  await repo.transact((current) => {
    current.items.push("created");
    current.packages.push(packageItem());
    current.collateral.push(collateral());
    current.submissions.push(submission());
    current.authorities.push(authority());
  });
  const loaded = await repo.load();
  assert.equal(loaded.authorities.length, 1);
  assert.deepEqual(database.row.state, state(["created"]));
});

test("all normalized collections hydrate and update outside aggregate JSON", async () => {
  const database = new FakeDatabase({
    row: { state: state(), revision: 2 }, auditEvents: [audit("audit-1")], documents: [document()], packages: [packageItem()],
    collateralRecords: [collateral()], submissions: [submission()], authorities: [authority()],
    versions: [{ documentId: "document-1", version: version(1) }],
  });
  const repo = repository(database);
  await repo.transact((current) => {
    current.documents[0].status = "VERIFIED";
    current.documents[0].versions.push(version(2));
    current.packages[0].status = "READY_FOR_SUBMISSION";
    current.collateral[0].status = "WITHDRAWN";
    current.submissions[0].status = "RECEIVED";
    current.authorities[0].status = "SUPERSEDED";
    current.audit.push(audit("audit-2"));
  });
  const loaded = await repo.load();
  assert.equal(loaded.documents[0].versions.length, 2);
  assert.equal(loaded.authorities[0].status, "SUPERSEDED");
  assert.deepEqual(database.row.state, state());
});

test("authority expiry, status, and ordering persist", async () => {
  const first = authority("authority-z");
  const second = { ...authority("authority-a"), actorId: "actor-2", scope: "DOCUMENT_VERIFY" };
  const database = new FakeDatabase({ row: { state: state(), revision: 2 }, authorities: [first, second] });
  const repo = repository(database);
  await repo.transact((current) => {
    current.authorities[0].status = "REVOKED";
    current.authorities[0].expiresAt = "2026-08-22T12:00:00.000Z";
    current.authorities.reverse();
  });
  const loaded = await repo.load();
  assert.deepEqual(loaded.authorities.map((item) => item.id), ["authority-a", "authority-z"]);
  assert.equal(loaded.authorities[1].status, "REVOKED");
  assert.equal(loaded.authorities[1].expiresAt, "2026-08-22T12:00:00.000Z");
});

test("normalized deletion and duplicate IDs are rejected", async () => {
  const database = new FakeDatabase({ row: { state: state(), revision: 2 }, packages: [packageItem()], collateralRecords: [collateral()], submissions: [submission()], authorities: [authority()] });
  const repo = repository(database);
  await assert.rejects(() => repo.transact((current) => current.authorities.splice(0, 1)), /AUTHORITY_DELETION_NOT_SUPPORTED/);
  await assert.rejects(() => repo.transact((current) => current.authorities.push(authority())), /AUTHORITY_ID_CONFLICT/);
  await assert.rejects(() => repo.transact((current) => current.submissions.splice(0, 1)), /SUBMISSION_DELETION_NOT_SUPPORTED/);
  assert.equal(database.row.revision, 2);
});

test("document versions remain immutable and sequential", async () => {
  const database = new FakeDatabase({ row: { state: state(), revision: 2 }, documents: [document()], versions: [{ documentId: "document-1", version: version(1) }] });
  const repo = repository(database);
  await assert.rejects(() => repo.transact((current) => { current.documents[0].versions[0].content = "rewritten"; }), /DOCUMENT_VERSION_HISTORY_IMMUTABLE/);
  await assert.rejects(() => repo.transact((current) => current.documents[0].versions.push(version(3))), /DOCUMENT_VERSION_SEQUENCE_INVALID/);
});

test("aggregate and every normalized record roll back together", async () => {
  const database = new FakeDatabase({ row: { state: state(["stable"]), revision: 2 }, packages: [packageItem()], collateralRecords: [collateral()], submissions: [submission()], authorities: [authority()] });
  const repo = repository(database);
  await assert.rejects(() => repo.transact((current) => {
    current.items.push("partial");
    current.packages[0].status = "READY_FOR_SUBMISSION";
    current.collateral[0].status = "WITHDRAWN";
    current.submissions[0].status = "ACCEPTED";
    current.authorities[0].status = "REVOKED";
    throw new Error("FAILED_OPERATION");
  }), /FAILED_OPERATION/);
  const loaded = await repo.load();
  assert.deepEqual(loaded.items, ["stable"]);
  assert.equal(loaded.authorities[0].status, "ACTIVE");
  assert.equal(database.row.revision, 2);
});

test("optimistic state conflicts are detected", async () => {
  const database = new FakeDatabase({ row: { state: state(), revision: 3 } });
  const repo = repository(database);
  const original = database.transaction.bind(database);
  database.transaction = (callback) => original(async (client) => callback({ query: async (text, values) => text.includes("UPDATE filing_office_state") ? { rows: [], rowCount: 0 } : client.query(text, values) }));
  await assert.rejects(() => repo.transact((current) => current.items.push("conflict")), /STATE_WRITE_CONFLICT/);
});

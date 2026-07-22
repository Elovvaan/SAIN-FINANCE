import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseStateRepository } from "../src/server/finance/database-state-repository.js";

function audit(id) {
  return { id, actorId: "actor-1", operation: "TEST", targetId: "target-1", at: "2026-07-22T12:00:00.000Z" };
}

function version(number) {
  return {
    version: number,
    content: `content-${number}`,
    checksum: `checksum-${number}`,
    createdAt: `2026-07-22T12:0${number}:00.000Z`,
    createdBy: "actor-1",
    frozen: false,
  };
}

function document(id = "document-1", versions = []) {
  return {
    id,
    ownerType: "INSTITUTION",
    ownerId: "institution-1",
    packageId: "package-1",
    type: "OC10",
    title: `Document ${id}`,
    status: "GENERATED",
    templateClass: "SAIN_INTERNAL_TEMPLATE",
    sourceVerificationRequired: false,
    versions,
  };
}

function packageItem(id = "package-1") {
  return {
    id,
    ownerType: "INSTITUTION",
    ownerId: "institution-1",
    type: "BIC_APPLICATION",
    status: "ASSEMBLING",
    requiredDocumentTypes: ["OC10"],
    conditionalDocumentTypes: [],
    documentIds: [],
    completionPercentage: 0,
    submissionIds: [],
  };
}

function collateral(id = "collateral-1") {
  return {
    id,
    institutionId: "institution-1",
    description: `Collateral ${id}`,
    amount: 1000,
    status: "PLEDGED",
    electronic: false,
    creditCardReceivable: false,
    thirdPartyCustodian: false,
    createdAt: "2026-07-22T12:00:00.000Z",
  };
}

function state(items = []) {
  return {
    schemaVersion: 1,
    items,
    audit: [],
    documents: [],
    packages: [],
    collateral: [],
  };
}

function validate(value) {
  if (!value || value.schemaVersion !== 1) throw new Error("INVALID_STATE");
  for (const key of ["audit", "documents", "packages", "collateral"]) {
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
  constructor({ row, auditEvents = [], documents = [], packages = [], collateralRecords = [], versions = [] } = {}) {
    this.row = row ? structuredClone(row) : undefined;
    this.audit = structuredClone(auditEvents);
    this.documents = documents.map((item, order) => ({ order, data: withoutVersions(structuredClone(item)) }));
    this.packages = packages.map((item, order) => ({ order, data: structuredClone(item) }));
    this.collateral = collateralRecords.map((item, order) => ({ order, data: structuredClone(item) }));
    this.versions = structuredClone(versions);
    this.queue = Promise.resolve();
  }

  transaction(callback) {
    const run = this.queue.then(async () => {
      const snapshot = structuredClone({
        row: this.row,
        audit: this.audit,
        documents: this.documents,
        packages: this.packages,
        collateral: this.collateral,
        versions: this.versions,
      });
      const client = { query: (text, values = []) => this.query(text, values) };
      try {
        return await callback(client);
      } catch (error) {
        Object.assign(this, snapshot);
        throw error;
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async query(text, values) {
    if (text.includes("SELECT state, revision")) {
      return { rows: this.row ? [structuredClone(this.row)] : [], rowCount: this.row ? 1 : 0 };
    }
    if (text.includes("SELECT document_id, document_order, document_data")) {
      const rows = this.documents.slice().sort((a, b) => a.order - b.order).map((entry) => ({
        document_id: entry.data.id,
        document_order: entry.order,
        document_data: structuredClone(entry.data),
      }));
      return { rows, rowCount: rows.length };
    }
    if (text.includes("SELECT package_id, package_order, package_data")) {
      const rows = this.packages.slice().sort((a, b) => a.order - b.order).map((entry) => ({
        package_id: entry.data.id,
        package_order: entry.order,
        package_data: structuredClone(entry.data),
      }));
      return { rows, rowCount: rows.length };
    }
    if (text.includes("SELECT collateral_id, collateral_order, collateral_data")) {
      const rows = this.collateral.slice().sort((a, b) => a.order - b.order).map((entry) => ({
        collateral_id: entry.data.id,
        collateral_order: entry.order,
        collateral_data: structuredClone(entry.data),
      }));
      return { rows, rowCount: rows.length };
    }
    if (text.includes("SELECT event") && text.includes("filing_office_audit_events")) {
      return { rows: this.audit.map((event) => ({ event: structuredClone(event) })), rowCount: this.audit.length };
    }
    if (text.includes("SELECT document_id, version_data")) {
      const rows = this.versions
        .slice()
        .sort((a, b) => a.documentId.localeCompare(b.documentId) || a.version.version - b.version.version)
        .map((entry) => ({ document_id: entry.documentId, version_data: structuredClone(entry.version) }));
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
    if (text.includes("INSERT INTO filing_office_documents")) {
      if (this.documents.some((entry) => entry.data.id === values[1])) throw uniqueError("duplicate document");
      this.documents.push({ order: values[2], data: JSON.parse(values[13]) });
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("UPDATE filing_office_documents")) return this.updateCollection(this.documents, values, 13);
    if (text.includes("INSERT INTO filing_office_packages")) {
      if (this.packages.some((entry) => entry.data.id === values[1])) throw uniqueError("duplicate package");
      this.packages.push({ order: values[2], data: JSON.parse(values[9]) });
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("UPDATE filing_office_packages")) return this.updateCollection(this.packages, values, 9);
    if (text.includes("INSERT INTO filing_office_collateral")) {
      if (this.collateral.some((entry) => entry.data.id === values[1])) throw uniqueError("duplicate collateral");
      this.collateral.push({ order: values[2], data: JSON.parse(values[12]) });
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("UPDATE filing_office_collateral")) return this.updateCollection(this.collateral, values, 12);
    if (text.includes("INSERT INTO filing_office_audit_events")) {
      if (this.audit.some((event) => event.id === values[1])) throw uniqueError("duplicate audit");
      this.audit.push(JSON.parse(values[9]));
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("INSERT INTO filing_office_document_versions")) {
      if (this.versions.some((entry) => entry.documentId === values[1] && entry.version.version === values[2])) {
        throw uniqueError("duplicate version");
      }
      this.versions.push({ documentId: values[1], version: JSON.parse(values[8]) });
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`UNEXPECTED_SQL: ${text}`);
  }

  updateCollection(collection, values, jsonIndex) {
    const index = collection.findIndex((entry) => entry.data.id === values[1]);
    if (index < 0) return { rows: [], rowCount: 0 };
    collection[index] = { order: values[2], data: JSON.parse(values[jsonIndex]) };
    return { rows: [], rowCount: 1 };
  }
}

function repository(database, allowInitialState = false) {
  return new DatabaseStateRepository({
    database,
    validate,
    createInitialState: () => state(),
    allowInitialState,
    institutionKey: "test-institution",
  });
}

test("repository fails closed when database state is missing", async () => {
  await assert.rejects(() => repository(new FakeDatabase()).load(), /STATE_STORE_UNAVAILABLE/);
});

test("initial state and normalized collections commit together", async () => {
  const database = new FakeDatabase();
  const repo = repository(database, true);
  await repo.transact((current) => {
    current.items.push("created");
    current.packages.push(packageItem());
    current.collateral.push(collateral());
  });
  const loaded = await repo.load();
  assert.deepEqual(loaded.items, ["created"]);
  assert.equal(loaded.packages.length, 1);
  assert.equal(loaded.collateral.length, 1);
  assert.deepEqual(database.row.state, state(["created"]));
});

test("all normalized collections hydrate and update outside aggregate JSON", async () => {
  const database = new FakeDatabase({
    row: { state: state(), revision: 2 },
    auditEvents: [audit("audit-1")],
    documents: [document()],
    packages: [packageItem()],
    collateralRecords: [collateral()],
    versions: [{ documentId: "document-1", version: version(1) }],
  });
  const repo = repository(database);
  await repo.transact((current) => {
    current.documents[0].status = "VERIFIED";
    current.documents[0].versions.push(version(2));
    current.packages[0].status = "READY_FOR_SUBMISSION";
    current.packages[0].completionPercentage = 100;
    current.collateral[0].status = "WITHDRAWN";
    current.collateral[0].withdrawnAt = "2026-07-22T13:00:00.000Z";
    current.audit.push(audit("audit-2"));
  });
  const loaded = await repo.load();
  assert.equal(loaded.documents[0].versions.length, 2);
  assert.equal(loaded.packages[0].completionPercentage, 100);
  assert.equal(loaded.collateral[0].status, "WITHDRAWN");
  assert.deepEqual(database.row.state, state());
});

test("collection ordering is preserved and intentional reordering persists", async () => {
  const database = new FakeDatabase({
    row: { state: state(), revision: 2 },
    packages: [packageItem("package-z"), packageItem("package-a")],
    collateralRecords: [collateral("collateral-z"), collateral("collateral-a")],
  });
  const repo = repository(database);
  await repo.transact((current) => {
    current.packages.reverse();
    current.collateral.reverse();
  });
  const loaded = await repo.load();
  assert.deepEqual(loaded.packages.map((item) => item.id), ["package-a", "package-z"]);
  assert.deepEqual(loaded.collateral.map((item) => item.id), ["collateral-a", "collateral-z"]);
});

test("normalized collection deletion and duplicate IDs are rejected", async () => {
  const database = new FakeDatabase({
    row: { state: state(), revision: 2 },
    packages: [packageItem()],
    collateralRecords: [collateral()],
  });
  const repo = repository(database);
  await assert.rejects(() => repo.transact((current) => current.packages.splice(0, 1)), /PACKAGE_DELETION_NOT_SUPPORTED/);
  await assert.rejects(() => repo.transact((current) => current.collateral.splice(0, 1)), /COLLATERAL_DELETION_NOT_SUPPORTED/);
  await assert.rejects(() => repo.transact((current) => current.collateral.push(collateral())), /COLLATERAL_ID_CONFLICT/);
  assert.equal(database.row.revision, 2);
});

test("document versions remain immutable and sequential", async () => {
  const database = new FakeDatabase({
    row: { state: state(), revision: 2 },
    documents: [document()],
    versions: [{ documentId: "document-1", version: version(1) }],
  });
  const repo = repository(database);
  await assert.rejects(
    () => repo.transact((current) => { current.documents[0].versions[0].content = "rewritten"; }),
    /DOCUMENT_VERSION_HISTORY_IMMUTABLE/,
  );
  await assert.rejects(
    () => repo.transact((current) => current.documents[0].versions.push(version(3))),
    /DOCUMENT_VERSION_SEQUENCE_INVALID/,
  );
});

test("aggregate and normalized records roll back together", async () => {
  const database = new FakeDatabase({
    row: { state: state(["stable"]), revision: 2 },
    packages: [packageItem()],
    collateralRecords: [collateral()],
  });
  const repo = repository(database);
  await assert.rejects(
    () => repo.transact((current) => {
      current.items.push("partial");
      current.packages[0].status = "READY_FOR_SUBMISSION";
      current.collateral[0].status = "WITHDRAWN";
      throw new Error("FAILED_OPERATION");
    }),
    /FAILED_OPERATION/,
  );
  const loaded = await repo.load();
  assert.deepEqual(loaded.items, ["stable"]);
  assert.equal(loaded.packages[0].status, "ASSEMBLING");
  assert.equal(loaded.collateral[0].status, "PLEDGED");
  assert.equal(database.row.revision, 2);
});

test("optimistic state conflicts are detected", async () => {
  const database = new FakeDatabase({ row: { state: state(), revision: 3 } });
  const repo = repository(database);
  const original = database.transaction.bind(database);
  database.transaction = (callback) => original(async (client) => callback({
    query: async (text, values) => text.includes("UPDATE filing_office_state")
      ? { rows: [], rowCount: 0 }
      : client.query(text, values),
  }));
  await assert.rejects(() => repo.transact((current) => current.items.push("conflict")), /STATE_WRITE_CONFLICT/);
});

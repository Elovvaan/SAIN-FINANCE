import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseStateRepository } from "../src/server/finance/database-state-repository.js";

function validateState(value) {
  if (!value || typeof value !== "object" || value.schemaVersion !== 1) throw new Error("INVALID_STATE");
  if (!Array.isArray(value.audit) || !Array.isArray(value.documents)) throw new Error("INVALID_COLLECTIONS");
  return structuredClone(value);
}

function createAuditEvent(id, operation = "TEST_OPERATION") {
  return { id, actorId: "actor-1", operation, targetId: "target-1", at: "2026-07-22T12:00:00.000Z", previousState: "OLD", resultingState: "NEW" };
}

function createVersion(version, content = `content-${version}`, frozen = false) {
  return {
    version,
    content,
    checksum: `checksum-${version}`,
    createdAt: `2026-07-22T12:0${version}:00.000Z`,
    createdBy: "actor-1",
    frozen,
  };
}

function createDocument(id = "document-1", versions = []) {
  return {
    id,
    ownerType: "INSTITUTION",
    ownerId: "institution-1",
    packageId: "package-1",
    type: "OC10",
    title: "Test Document",
    status: "GENERATED",
    templateClass: "SAIN_INTERNAL_TEMPLATE",
    sourceVerificationRequired: false,
    versions,
  };
}

function metadata(document) {
  const { versions: _versions, ...documentData } = document;
  return documentData;
}

class FakeDatabase {
  constructor(initialRow, initialAudit = [], initialDocuments = [], initialVersions = []) {
    this.row = initialRow ? structuredClone(initialRow) : undefined;
    this.audit = structuredClone(initialAudit);
    this.documents = initialDocuments.map((document) => metadata(structuredClone(document)));
    this.versions = structuredClone(initialVersions);
    this.queue = Promise.resolve();
  }

  transaction(callback) {
    const run = this.queue.then(async () => {
      const snapshots = structuredClone({
        row: this.row,
        audit: this.audit,
        documents: this.documents,
        versions: this.versions,
      });
      const client = {
        query: async (text, values = []) => {
          if (text.includes("SELECT state, revision")) {
            return { rows: this.row ? [structuredClone(this.row)] : [], rowCount: this.row ? 1 : 0 };
          }
          if (text.includes("SELECT document_id, document_data")) {
            return {
              rows: this.documents.map((document) => ({
                document_id: document.id,
                document_data: structuredClone(document),
              })),
              rowCount: this.documents.length,
            };
          }
          if (text.includes("SELECT event") && text.includes("filing_office_audit_events")) {
            return { rows: this.audit.map((event) => ({ event: structuredClone(event) })), rowCount: this.audit.length };
          }
          if (text.includes("SELECT document_id, version_data")) {
            return {
              rows: this.versions
                .slice()
                .sort((a, b) => a.documentId.localeCompare(b.documentId) || a.version.version - b.version.version)
                .map((entry) => ({ document_id: entry.documentId, version_data: structuredClone(entry.version) })),
              rowCount: this.versions.length,
            };
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
            if (this.documents.some((document) => document.id === values[1])) throw uniqueError("duplicate document");
            this.documents.push(JSON.parse(values[12]));
            return { rows: [], rowCount: 1 };
          }
          if (text.includes("UPDATE filing_office_documents")) {
            const index = this.documents.findIndex((document) => document.id === values[1]);
            if (index < 0) return { rows: [], rowCount: 0 };
            this.documents[index] = JSON.parse(values[12]);
            return { rows: [], rowCount: 1 };
          }
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
        },
      };

      try {
        return await callback(client);
      } catch (error) {
        this.row = snapshots.row;
        this.audit = snapshots.audit;
        this.documents = snapshots.documents;
        this.versions = snapshots.versions;
        throw error;
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}

function uniqueError(message) {
  const error = new Error(message);
  error.code = "23505";
  return error;
}

function createRepository(database, allowInitialState = false) {
  return new DatabaseStateRepository({
    database,
    validate: validateState,
    createInitialState: () => ({ schemaVersion: 1, items: [], audit: [], documents: [] }),
    allowInitialState,
    institutionKey: "test-institution",
  });
}

function createStoredState(items = []) {
  return { schemaVersion: 1, items, audit: [], documents: [] };
}

test("database repository fails closed when no row exists", async () => {
  await assert.rejects(() => createRepository(new FakeDatabase()).load(), /STATE_STORE_UNAVAILABLE/);
});

test("database repository initializes state inside a transaction", async () => {
  const database = new FakeDatabase();
  const repository = createRepository(database, true);
  await repository.transact((state) => state.items.push("created"));
  assert.deepEqual(await repository.load(), { schemaVersion: 1, items: ["created"], audit: [], documents: [] });
  assert.equal(database.row.revision, 1);
});

test("database repository serializes concurrent transactions without lost updates", async () => {
  const database = new FakeDatabase({ state: createStoredState(), revision: 4 });
  const repository = createRepository(database);
  await Promise.all([
    repository.transact(async (state) => { await new Promise((resolve) => setTimeout(resolve, 10)); state.items.push("first"); }),
    repository.transact((state) => state.items.push("second")),
  ]);
  assert.deepEqual((await repository.load()).items, ["first", "second"]);
  assert.equal(database.row.revision, 6);
});

test("database repository stores documents, versions, and audit outside aggregate JSON", async () => {
  const version1 = createVersion(1);
  const database = new FakeDatabase(
    { state: createStoredState(), revision: 2 },
    [createAuditEvent("audit-1", "EXISTING")],
    [createDocument("document-1")],
    [{ documentId: "document-1", version: version1 }],
  );
  const repository = createRepository(database);
  const version2 = createVersion(2);

  await repository.transact((state) => {
    state.audit.push(createAuditEvent("audit-2", "APPENDED"));
    state.documents[0].status = "SIGNED";
    state.documents[0].signedBy = "actor-1";
    state.documents[0].versions.push(version2);
  });

  const loaded = await repository.load();
  assert.equal(loaded.documents[0].status, "SIGNED");
  assert.equal(loaded.documents[0].signedBy, "actor-1");
  assert.deepEqual(loaded.documents[0].versions, [version1, version2]);
  assert.equal(loaded.audit.length, 2);
  assert.deepEqual(database.row.state.audit, []);
  assert.deepEqual(database.row.state.documents, []);
  assert.equal(database.documents.length, 1);
  assert.equal(database.versions.length, 2);
});

test("database repository inserts newly generated documents", async () => {
  const database = new FakeDatabase({ state: createStoredState(), revision: 1 });
  const repository = createRepository(database);
  const document = createDocument("document-2", [createVersion(1)]);

  await repository.transact((state) => state.documents.push(document));

  assert.deepEqual(await repository.load(), {
    schemaVersion: 1,
    items: [],
    audit: [],
    documents: [document],
  });
  assert.equal(database.documents.length, 1);
  assert.equal(database.versions.length, 1);
});

test("database repository rejects document deletion and duplicate document IDs", async () => {
  const database = new FakeDatabase(
    { state: createStoredState(), revision: 2 },
    [],
    [createDocument()],
  );
  const repository = createRepository(database);

  await assert.rejects(
    () => repository.transact((state) => state.documents.splice(0, 1)),
    /DOCUMENT_DELETION_NOT_SUPPORTED/,
  );
  await assert.rejects(
    () => repository.transact((state) => state.documents.push(createDocument())),
    /DOCUMENT_ID_CONFLICT/,
  );
  assert.equal(database.documents.length, 1);
  assert.equal(database.row.revision, 2);
});

test("database repository rejects rewriting or deleting document version history", async () => {
  const version1 = createVersion(1, "original");
  const database = new FakeDatabase(
    { state: createStoredState(), revision: 2 },
    [],
    [createDocument()],
    [{ documentId: "document-1", version: version1 }],
  );
  const repository = createRepository(database);

  await assert.rejects(
    () => repository.transact((state) => state.documents[0].versions.splice(0, 1)),
    /DOCUMENT_VERSION_HISTORY_IMMUTABLE/,
  );
  await assert.rejects(
    () => repository.transact((state) => { state.documents[0].versions[0].content = "rewritten"; }),
    /DOCUMENT_VERSION_HISTORY_IMMUTABLE/,
  );
  assert.deepEqual(database.versions, [{ documentId: "document-1", version: version1 }]);
  assert.equal(database.row.revision, 2);
});

test("database repository enforces sequential document version numbers", async () => {
  const version1 = createVersion(1);
  const database = new FakeDatabase(
    { state: createStoredState(), revision: 2 },
    [],
    [createDocument()],
    [{ documentId: "document-1", version: version1 }],
  );
  const repository = createRepository(database);
  await assert.rejects(
    () => repository.transact((state) => state.documents[0].versions.push(createVersion(3))),
    /DOCUMENT_VERSION_SEQUENCE_INVALID/,
  );
});

test("database repository rolls back aggregate, documents, audit, and versions together", async () => {
  const version1 = createVersion(1);
  const database = new FakeDatabase(
    { state: createStoredState(["stable"]), revision: 2 },
    [createAuditEvent("audit-1")],
    [createDocument()],
    [{ documentId: "document-1", version: version1 }],
  );
  const repository = createRepository(database);
  await assert.rejects(
    () => repository.transact((state) => {
      state.items.push("partial");
      state.documents[0].status = "SIGNED";
      state.audit.push(createAuditEvent("audit-2"));
      state.documents[0].versions.push(createVersion(2));
      throw new Error("FAILED_OPERATION");
    }),
    /FAILED_OPERATION/,
  );
  const loaded = await repository.load();
  assert.deepEqual(loaded.items, ["stable"]);
  assert.equal(loaded.documents[0].status, "GENERATED");
  assert.equal(database.audit.length, 1);
  assert.equal(database.versions.length, 1);
  assert.equal(database.row.revision, 2);
});

test("database repository detects optimistic write conflicts", async () => {
  const database = new FakeDatabase({ state: createStoredState(), revision: 3 });
  const repository = createRepository(database);
  const originalTransaction = database.transaction.bind(database);
  database.transaction = (callback) => originalTransaction(async (client) => callback({
    query: async (text, values) => text.includes("UPDATE filing_office_state")
      ? { rows: [], rowCount: 0 }
      : client.query(text, values),
  }));
  await assert.rejects(() => repository.transact((state) => state.items.push("conflict")), /STATE_WRITE_CONFLICT/);
});

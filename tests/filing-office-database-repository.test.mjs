import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseStateRepository } from "../src/server/finance/database-state-repository.js";

function validateState(value) {
  if (!value || typeof value !== "object" || value.schemaVersion !== 1) {
    throw new Error("INVALID_STATE");
  }
  if (!Array.isArray(value.audit)) throw new Error("INVALID_AUDIT");
  return structuredClone(value);
}

function createAuditEvent(id, operation = "TEST_OPERATION") {
  return {
    id,
    actorId: "actor-1",
    operation,
    targetId: "target-1",
    at: "2026-07-22T12:00:00.000Z",
    previousState: "OLD",
    resultingState: "NEW",
  };
}

class FakeDatabase {
  constructor(initialRow, initialAudit = []) {
    this.row = initialRow ? structuredClone(initialRow) : undefined;
    this.audit = structuredClone(initialAudit);
    this.queue = Promise.resolve();
  }

  transaction(callback) {
    const run = this.queue.then(async () => {
      const rowSnapshot = this.row ? structuredClone(this.row) : undefined;
      const auditSnapshot = structuredClone(this.audit);
      const client = {
        query: async (text, values = []) => {
          if (text.includes("SELECT state, revision")) {
            return { rows: this.row ? [structuredClone(this.row)] : [], rowCount: this.row ? 1 : 0 };
          }

          if (text.includes("SELECT event") && text.includes("filing_office_audit_events")) {
            return {
              rows: this.audit.map((event) => ({ event: structuredClone(event) })),
              rowCount: this.audit.length,
            };
          }

          if (text.includes("INSERT INTO filing_office_state")) {
            if (this.row) {
              const error = new Error("duplicate");
              error.code = "23505";
              throw error;
            }
            this.row = { state: JSON.parse(values[1]), revision: 1 };
            return { rows: [{ revision: 1 }], rowCount: 1 };
          }

          if (text.includes("UPDATE filing_office_state")) {
            if (!this.row || this.row.revision !== values[2]) {
              return { rows: [], rowCount: 0 };
            }
            this.row = {
              state: JSON.parse(values[1]),
              revision: this.row.revision + 1,
            };
            return { rows: [{ revision: this.row.revision }], rowCount: 1 };
          }

          if (text.includes("INSERT INTO filing_office_audit_events")) {
            if (this.audit.some((event) => event.id === values[1])) {
              const error = new Error("duplicate audit event");
              error.code = "23505";
              throw error;
            }
            this.audit.push(JSON.parse(values[9]));
            return { rows: [], rowCount: 1 };
          }

          throw new Error(`UNEXPECTED_SQL: ${text}`);
        },
      };

      try {
        return await callback(client);
      } catch (error) {
        this.row = rowSnapshot;
        this.audit = auditSnapshot;
        throw error;
      }
    });

    this.queue = run.catch(() => undefined);
    return run;
  }
}

function createRepository(database, allowInitialState = false) {
  return new DatabaseStateRepository({
    database,
    validate: validateState,
    createInitialState: () => ({ schemaVersion: 1, items: [], audit: [] }),
    allowInitialState,
    institutionKey: "test-institution",
  });
}

function createStoredState(items = []) {
  return { schemaVersion: 1, items, audit: [] };
}

test("database repository fails closed when no row exists", async () => {
  const repository = createRepository(new FakeDatabase());
  await assert.rejects(() => repository.load(), /STATE_STORE_UNAVAILABLE/);
});

test("database repository initializes state inside a transaction", async () => {
  const database = new FakeDatabase();
  const repository = createRepository(database, true);

  await repository.transact((state) => {
    state.items.push("created");
  });

  assert.deepEqual(await repository.load(), {
    schemaVersion: 1,
    items: ["created"],
    audit: [],
  });
  assert.equal(database.row.revision, 1);
  assert.deepEqual(database.row.state.audit, []);
});

test("database repository serializes concurrent transactions without lost updates", async () => {
  const database = new FakeDatabase({
    state: createStoredState(),
    revision: 4,
  });
  const repository = createRepository(database);

  await Promise.all([
    repository.transact(async (state) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      state.items.push("first");
    }),
    repository.transact((state) => {
      state.items.push("second");
    }),
  ]);

  assert.deepEqual((await repository.load()).items, ["first", "second"]);
  assert.equal(database.row.revision, 6);
});

test("database repository stores appended audit events outside aggregate JSON", async () => {
  const existing = createAuditEvent("00000000-0000-4000-8000-000000000001", "EXISTING");
  const appended = createAuditEvent("00000000-0000-4000-8000-000000000002", "APPENDED");
  const database = new FakeDatabase(
    { state: createStoredState(), revision: 2 },
    [existing],
  );
  const repository = createRepository(database);

  await repository.transact((state) => {
    state.audit.push(appended);
  });

  assert.deepEqual((await repository.load()).audit, [existing, appended]);
  assert.deepEqual(database.row.state.audit, []);
  assert.deepEqual(database.audit, [existing, appended]);
});

test("database repository rejects deletion or rewriting of audit history", async () => {
  const existing = createAuditEvent("00000000-0000-4000-8000-000000000001", "EXISTING");
  const database = new FakeDatabase(
    { state: createStoredState(), revision: 2 },
    [existing],
  );
  const repository = createRepository(database);

  await assert.rejects(
    () => repository.transact((state) => state.audit.splice(0, 1)),
    /AUDIT_HISTORY_IMMUTABLE/,
  );

  await assert.rejects(
    () => repository.transact((state) => {
      state.audit[0].operation = "REWRITTEN";
    }),
    /AUDIT_HISTORY_IMMUTABLE/,
  );

  assert.deepEqual(database.audit, [existing]);
  assert.equal(database.row.revision, 2);
});

test("database repository rolls back aggregate and audit when callback fails", async () => {
  const existing = createAuditEvent("00000000-0000-4000-8000-000000000001", "EXISTING");
  const database = new FakeDatabase(
    { state: createStoredState(["stable"]), revision: 2 },
    [existing],
  );
  const repository = createRepository(database);

  await assert.rejects(
    () =>
      repository.transact((state) => {
        state.items.push("partial");
        state.audit.push(createAuditEvent("00000000-0000-4000-8000-000000000002"));
        throw new Error("FAILED_OPERATION");
      }),
    /FAILED_OPERATION/,
  );

  assert.deepEqual(await repository.load(), {
    schemaVersion: 1,
    items: ["stable"],
    audit: [existing],
  });
  assert.equal(database.row.revision, 2);
  assert.deepEqual(database.audit, [existing]);
});

test("database repository detects optimistic write conflicts", async () => {
  const database = new FakeDatabase({
    state: createStoredState(),
    revision: 3,
  });
  const repository = createRepository(database);

  const originalTransaction = database.transaction.bind(database);
  database.transaction = (callback) =>
    originalTransaction(async (client) => {
      const wrapped = {
        query: async (text, values) => {
          if (text.includes("UPDATE filing_office_state")) {
            return { rows: [], rowCount: 0 };
          }
          return client.query(text, values);
        },
      };
      return callback(wrapped);
    });

  await assert.rejects(
    () => repository.transact((state) => state.items.push("conflict")),
    /STATE_WRITE_CONFLICT/,
  );
});

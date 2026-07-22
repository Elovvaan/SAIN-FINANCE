import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseStateRepository } from "../src/server/finance/database-state-repository.ts";

function validateState(value) {
  if (!value || typeof value !== "object" || value.schemaVersion !== 1) {
    throw new Error("INVALID_STATE");
  }
  return structuredClone(value);
}

class FakeDatabase {
  constructor(initialRow) {
    this.row = initialRow ? structuredClone(initialRow) : undefined;
    this.queue = Promise.resolve();
  }

  transaction(callback) {
    const run = this.queue.then(async () => {
      const snapshot = this.row ? structuredClone(this.row) : undefined;
      const client = {
        query: async (text, values = []) => {
          if (text.includes("SELECT state, revision")) {
            return { rows: this.row ? [structuredClone(this.row)] : [], rowCount: this.row ? 1 : 0 };
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

          throw new Error(`UNEXPECTED_SQL: ${text}`);
        },
      };

      try {
        return await callback(client);
      } catch (error) {
        this.row = snapshot;
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
    createInitialState: () => ({ schemaVersion: 1, items: [] }),
    allowInitialState,
    institutionKey: "test-institution",
  });
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
  });
  assert.equal(database.row.revision, 1);
});

test("database repository serializes concurrent transactions without lost updates", async () => {
  const database = new FakeDatabase({
    state: { schemaVersion: 1, items: [] },
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

test("database repository rolls back state when callback fails", async () => {
  const database = new FakeDatabase({
    state: { schemaVersion: 1, items: ["stable"] },
    revision: 2,
  });
  const repository = createRepository(database);

  await assert.rejects(
    () =>
      repository.transact((state) => {
        state.items.push("partial");
        throw new Error("FAILED_OPERATION");
      }),
    /FAILED_OPERATION/,
  );

  assert.deepEqual(await repository.load(), {
    schemaVersion: 1,
    items: ["stable"],
  });
  assert.equal(database.row.revision, 2);
});

test("database repository detects optimistic write conflicts", async () => {
  const database = new FakeDatabase({
    state: { schemaVersion: 1, items: [] },
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

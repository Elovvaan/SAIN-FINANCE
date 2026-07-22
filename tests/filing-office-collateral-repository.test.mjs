import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseStateRepository } from "../src/server/finance/database-state-repository.js";

function collateral(id = "collateral-1", overrides = {}) {
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
    ...overrides,
  };
}

function state() {
  return {
    schemaVersion: 1,
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

class FakeDatabase {
  constructor(initialCollateral = []) {
    this.row = { state: state(), revision: 1 };
    this.collateral = initialCollateral.map((item, order) => ({ order, data: structuredClone(item) }));
    this.queue = Promise.resolve();
  }

  transaction(callback) {
    const run = this.queue.then(async () => {
      const snapshot = structuredClone({ row: this.row, collateral: this.collateral });
      const client = {
        query: async (text, values = []) => {
          if (text.includes("SELECT state, revision")) {
            return { rows: [structuredClone(this.row)], rowCount: 1 };
          }
          if (text.includes("SELECT document_id, document_order, document_data")) return { rows: [], rowCount: 0 };
          if (text.includes("SELECT package_id, package_order, package_data")) return { rows: [], rowCount: 0 };
          if (text.includes("SELECT collateral_id, collateral_order, collateral_data")) {
            const ordered = this.collateral.slice().sort((a, b) => a.order - b.order);
            return {
              rows: ordered.map((entry) => ({
                collateral_id: entry.data.id,
                collateral_order: entry.order,
                collateral_data: structuredClone(entry.data),
              })),
              rowCount: ordered.length,
            };
          }
          if (text.includes("SELECT event") && text.includes("filing_office_audit_events")) return { rows: [], rowCount: 0 };
          if (text.includes("SELECT document_id, version_data")) return { rows: [], rowCount: 0 };
          if (text.includes("UPDATE filing_office_state")) {
            if (this.row.revision !== values[2]) return { rows: [], rowCount: 0 };
            this.row = { state: JSON.parse(values[1]), revision: this.row.revision + 1 };
            return { rows: [{ revision: this.row.revision }], rowCount: 1 };
          }
          if (text.includes("INSERT INTO filing_office_collateral")) {
            if (this.collateral.some((entry) => entry.data.id === values[1])) {
              const error = new Error("duplicate collateral");
              error.code = "23505";
              throw error;
            }
            this.collateral.push({ order: values[2], data: JSON.parse(values[12]) });
            return { rows: [], rowCount: 1 };
          }
          if (text.includes("UPDATE filing_office_collateral")) {
            const index = this.collateral.findIndex((entry) => entry.data.id === values[1]);
            if (index < 0) return { rows: [], rowCount: 0 };
            this.collateral[index] = { order: values[2], data: JSON.parse(values[12]) };
            return { rows: [], rowCount: 1 };
          }
          throw new Error(`UNEXPECTED_SQL: ${text}`);
        },
      };
      try {
        return await callback(client);
      } catch (error) {
        this.row = snapshot.row;
        this.collateral = snapshot.collateral;
        throw error;
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}

function repository(database) {
  return new DatabaseStateRepository({
    database,
    validate,
    createInitialState: state,
    institutionKey: "test-institution",
  });
}

test("collateral records are stored outside aggregate JSON and hydrated in order", async () => {
  const database = new FakeDatabase();
  const repo = repository(database);
  const first = collateral("collateral-z");
  const second = collateral("collateral-a", { electronic: true, creditCardReceivable: true });

  await repo.transact((current) => current.collateral.push(first, second));

  assert.deepEqual((await repo.load()).collateral, [first, second]);
  assert.deepEqual(database.row.state.collateral, []);
  assert.deepEqual(database.collateral.map((entry) => entry.order), [0, 1]);
});

test("collateral withdrawal status and timestamp persist", async () => {
  const existing = collateral();
  const database = new FakeDatabase([existing]);
  const repo = repository(database);

  await repo.transact((current) => {
    current.collateral[0].status = "WITHDRAWN";
    current.collateral[0].withdrawnAt = "2026-07-22T13:00:00.000Z";
  });

  const loaded = await repo.load();
  assert.equal(loaded.collateral[0].status, "WITHDRAWN");
  assert.equal(loaded.collateral[0].withdrawnAt, "2026-07-22T13:00:00.000Z");
});

test("collateral reordering persists", async () => {
  const database = new FakeDatabase([collateral("first"), collateral("second")]);
  const repo = repository(database);
  await repo.transact((current) => current.collateral.reverse());
  assert.deepEqual((await repo.load()).collateral.map((item) => item.id), ["second", "first"]);
});

test("collateral deletion and duplicate IDs are rejected", async () => {
  const database = new FakeDatabase([collateral()]);
  const repo = repository(database);

  await assert.rejects(
    () => repo.transact((current) => current.collateral.splice(0, 1)),
    /COLLATERAL_DELETION_NOT_SUPPORTED/,
  );
  await assert.rejects(
    () => repo.transact((current) => current.collateral.push(collateral())),
    /COLLATERAL_ID_CONFLICT/,
  );
  assert.equal(database.collateral.length, 1);
  assert.equal(database.row.revision, 1);
});

test("collateral and aggregate changes roll back together", async () => {
  const database = new FakeDatabase([collateral()]);
  const repo = repository(database);

  await assert.rejects(
    () => repo.transact((current) => {
      current.collateral[0].status = "WITHDRAWN";
      current.collateral[0].withdrawnAt = "2026-07-22T13:00:00.000Z";
      throw new Error("FAILED_OPERATION");
    }),
    /FAILED_OPERATION/,
  );

  assert.equal((await repo.load()).collateral[0].status, "PLEDGED");
  assert.equal(database.row.revision, 1);
});

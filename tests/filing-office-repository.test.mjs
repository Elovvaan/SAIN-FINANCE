import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  InMemoryStateRepository,
  JsonFileStateRepository,
} from "../src/server/finance/filing-office-repository.js";

function validateState(value) {
  if (!value || typeof value !== "object" || value.schemaVersion !== 1) {
    throw new Error("INVALID_STATE");
  }
  return value;
}

test("in-memory repository isolates loaded state from stored state", async () => {
  const repository = new InMemoryStateRepository({ schemaVersion: 1, items: [] });
  const first = await repository.load();
  first.items.push("changed outside repository");

  const second = await repository.load();
  assert.deepEqual(second, { schemaVersion: 1, items: [] });
});

test("in-memory transactions serialize concurrent mutations", async () => {
  const repository = new InMemoryStateRepository({ schemaVersion: 1, count: 0 });

  await Promise.all(
    Array.from({ length: 25 }, () =>
      repository.transact(async (state) => {
        const current = state.count;
        await new Promise((resolve) => setTimeout(resolve, 1));
        state.count = current + 1;
      }),
    ),
  );

  assert.equal((await repository.load()).count, 25);
});

test("failed transactions do not persist partial mutations", async () => {
  const repository = new InMemoryStateRepository({ schemaVersion: 1, items: [] });

  await assert.rejects(
    () => repository.transact((state) => {
      state.items.push("partial");
      throw new Error("TRANSACTION_FAILED");
    }),
    /TRANSACTION_FAILED/,
  );

  assert.deepEqual(await repository.load(), { schemaVersion: 1, items: [] });
});

test("transaction queue continues after a failed transaction", async () => {
  const repository = new InMemoryStateRepository({ schemaVersion: 1, count: 0 });

  await assert.rejects(
    () => repository.transact(() => {
      throw new Error("EXPECTED_FAILURE");
    }),
    /EXPECTED_FAILURE/,
  );

  await repository.transact((state) => {
    state.count += 1;
  });

  assert.equal((await repository.load()).count, 1);
});

test("json repository creates an initial state only when explicitly allowed", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sain-store-"));
  try {
    const repository = new JsonFileStateRepository({
      dataDirectory: directory,
      fileName: "state.json",
      backupFileName: "state.backup.json",
      validate: validateState,
      createInitialState: () => ({ schemaVersion: 1, items: [] }),
      allowInitialState: true,
    });

    assert.deepEqual(await repository.load(), { schemaVersion: 1, items: [] });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("json repository fails closed when primary and backup state are unavailable", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sain-store-"));
  try {
    const repository = new JsonFileStateRepository({
      dataDirectory: directory,
      fileName: "state.json",
      backupFileName: "state.backup.json",
      validate: validateState,
      createInitialState: () => ({ schemaVersion: 1, items: [] }),
    });

    await assert.rejects(() => repository.load(), /STATE_STORE_UNAVAILABLE/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("json repository recovers from a valid backup when the primary is corrupt", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sain-store-"));
  try {
    await writeFile(path.join(directory, "state.json"), "not-json", "utf8");
    await writeFile(
      path.join(directory, "state.backup.json"),
      JSON.stringify({ schemaVersion: 1, items: ["backup"] }),
      "utf8",
    );

    const repository = new JsonFileStateRepository({
      dataDirectory: directory,
      fileName: "state.json",
      backupFileName: "state.backup.json",
      validate: validateState,
      createInitialState: () => ({ schemaVersion: 1, items: [] }),
    });

    assert.deepEqual(await repository.load(), { schemaVersion: 1, items: ["backup"] });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("json repository preserves the previous primary as a backup before replacement", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sain-store-"));
  try {
    const repository = new JsonFileStateRepository({
      dataDirectory: directory,
      fileName: "state.json",
      backupFileName: "state.backup.json",
      validate: validateState,
      createInitialState: () => ({ schemaVersion: 1, items: [] }),
      allowInitialState: true,
    });

    await repository.save({ schemaVersion: 1, items: ["first"] });
    await repository.save({ schemaVersion: 1, items: ["second"] });

    assert.deepEqual(JSON.parse(await readFile(path.join(directory, "state.json"), "utf8")), {
      schemaVersion: 1,
      items: ["second"],
    });
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, "state.backup.json"), "utf8")), {
      schemaVersion: 1,
      items: ["first"],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("json transactions serialize concurrent mutations", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sain-store-"));
  try {
    const repository = new JsonFileStateRepository({
      dataDirectory: directory,
      fileName: "state.json",
      backupFileName: "state.backup.json",
      validate: validateState,
      createInitialState: () => ({ schemaVersion: 1, count: 0 }),
      allowInitialState: true,
    });

    await Promise.all(
      Array.from({ length: 10 }, () =>
        repository.transact(async (state) => {
          const current = state.count;
          await new Promise((resolve) => setTimeout(resolve, 1));
          state.count = current + 1;
        }),
      ),
    );

    assert.equal((await repository.load()).count, 10);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const operationsRoute = new URL(
  "../src/app/api/filing-office/operations/route.ts",
  import.meta.url,
);
const snapshotRoute = new URL(
  "../src/app/api/filing-office/snapshot/route.ts",
  import.meta.url,
);
const serviceModule = new URL(
  "../src/server/finance/filing-office-service.ts",
  import.meta.url,
);

test("Filing Office API routes use the repository-backed service", async () => {
  const [operations, snapshot] = await Promise.all([
    readFile(operationsRoute, "utf8"),
    readFile(snapshotRoute, "utf8"),
  ]);

  assert.match(operations, /@\/server\/finance\/filing-office-service/);
  assert.match(snapshot, /@\/server\/finance\/filing-office-service/);
  assert.doesNotMatch(operations, /from "@\/server\/finance\/filing-office";/);
  assert.doesNotMatch(snapshot, /from "@\/server\/finance\/filing-office";/);
});

test("repository-backed service loads and saves through the repository boundary", async () => {
  const service = await readFile(serviceModule, "utf8");

  assert.match(service, /getFilingOfficeRepository\(\)/);
  assert.match(service, /const state = await repository\.load\(\)/);
  assert.match(service, /await repository\.save\(state\)/);
  assert.doesNotMatch(service, /readFile\(/);
  assert.doesNotMatch(service, /writeFile\(/);
});

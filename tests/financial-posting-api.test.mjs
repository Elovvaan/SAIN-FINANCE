import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("financial posting API derives operator identity from the authenticated session", async () => {
  const route = await source("src/app/api/finance/postings/route.ts");

  assert.match(route, /currentPlatformOperator\(\)/);
  assert.match(route, /operator\.institutionKey/);
  assert.match(route, /operator\.userId/);
  assert.match(route, /FINANCIAL_POSTING_CREATE/);
  assert.doesNotMatch(route, /body\.operator/);
});

test("financial reversal API requires explicit reversal permission", async () => {
  const route = await source("src/app/api/finance/postings/reverse/route.ts");

  assert.match(route, /currentPlatformOperator\(\)/);
  assert.match(route, /FINANCIAL_POSTING_REVERSE/);
  assert.match(route, /FinancialPostingService\.reverse/);
  assert.doesNotMatch(route, /body\.operator/);
});

test("financial posting permissions are granted through a migration", async () => {
  const migration = await source("database/migrations/135_pcp6_financial_posting_permissions.sql");

  assert.match(migration, /FINANCIAL_POSTING_CREATE/);
  assert.match(migration, /FINANCIAL_POSTING_REVERSE/);
  assert.match(migration, /role-institution-administrator/);
  assert.match(migration, /role-treasury-officer/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
});

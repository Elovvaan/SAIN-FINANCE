import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../src/app/api/employer/funding/route.ts", import.meta.url), "utf8");
const service = await readFile(new URL("../src/server/finance/employer-funding-service.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../database/migrations/136_pcp7_employer_funding_ledger.sql", import.meta.url), "utf8");

test("employer funding API derives operator from authenticated session", () => {
  assert.match(route, /currentPlatformOperator\(\)/);
  assert.doesNotMatch(route, /body\.operator/);
  assert.doesNotMatch(route, /body\.institutionKey/);
  assert.doesNotMatch(route, /body\.userId/);
});

test("employer funding API enforces separate configure and post permissions", () => {
  assert.match(route, /EMPLOYER_FUNDING_CONFIGURE/);
  assert.match(route, /EMPLOYER_FUNDING_POST/);
  assert.match(route, /PERMISSION_REQUIRED/);
});

test("employer funding service posts balanced ledger lines through centralized service", () => {
  assert.match(service, /FinancialPostingService\.post/);
  assert.match(service, /debitAmount: fundingAmount/);
  assert.match(service, /creditAmount: fundingAmount/);
  assert.match(service, /sourceModule: "EMPLOYER_FUNDING"/);
  assert.match(service, /employer-funding:\$\{idempotencyKey\}/);
});

test("employer funding schema preserves posting and journal linkage", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS employer_funding_profiles/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS employer_funding_events/);
  assert.match(migration, /REFERENCES financial_postings\(institution_key, posting_id\)/);
  assert.match(migration, /REFERENCES gl_journal_entries\(institution_key, gl_journal_entry_id\)/);
  assert.match(migration, /UNIQUE \(institution_key, idempotency_key\)/);
});

test("treasury and institution administrator roles receive employer funding permissions", () => {
  assert.match(migration, /role-institution-administrator[\s\S]*EMPLOYER_FUNDING_CONFIGURE/);
  assert.match(migration, /role-institution-administrator[\s\S]*EMPLOYER_FUNDING_POST/);
  assert.match(migration, /role-treasury-officer[\s\S]*EMPLOYER_FUNDING_CONFIGURE/);
  assert.match(migration, /role-treasury-officer[\s\S]*EMPLOYER_FUNDING_POST/);
});

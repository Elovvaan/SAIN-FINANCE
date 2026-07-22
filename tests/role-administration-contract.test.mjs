import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../database/migrations/017_create_role_assignment_audit.sql", import.meta.url), "utf8");
const service = await readFile(new URL("../src/server/auth/role-administration-service.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../src/app/api/auth/roles/route.ts", import.meta.url), "utf8");

test("role assignment audit history is append-only", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS role_assignment_events/);
  assert.match(migration, /ROLE_ASSIGNMENT_EVENT_HISTORY_IMMUTABLE/);
  assert.match(migration, /BEFORE UPDATE ON role_assignment_events/);
  assert.match(migration, /BEFORE DELETE ON role_assignment_events/);
});

test("role assignments create linked authority grants transactionally", () => {
  assert.match(service, /INSERT INTO user_roles/);
  assert.match(service, /INSERT INTO authority_grants/);
  assert.match(service, /INSERT INTO user_role_authority_grants/);
  assert.match(service, /expiresAt/);
  assert.match(service, /ROLE_ASSIGNMENT/);
});

test("role revocation revokes linked authorities and records the event", () => {
  assert.match(service, /status = 'REVOKED'/);
  assert.match(service, /FROM user_role_authority_grants/);
  assert.match(service, /event_type[\s\S]*'REVOKED'/);
  assert.match(service, /REVOCATION_REASON_REQUIRED/);
});

test("role administration requires a database-backed institution administrator", () => {
  assert.match(service, /roles\.role_code = 'INSTITUTION_ADMIN'/);
  assert.match(service, /ROLE_ADMIN_REQUIRED/);
  assert.match(route, /await requireOperator\(request\)/);
});

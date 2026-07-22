import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const session = await readFile(new URL("../src/server/auth/operator-session.ts", import.meta.url), "utf8");
const identity = await readFile(new URL("../src/server/auth/identity-service.ts", import.meta.url), "utf8");
const operations = await readFile(new URL("../src/app/api/filing-office/operations/route.ts", import.meta.url), "utf8");
const snapshot = await readFile(new URL("../src/app/api/filing-office/snapshot/route.ts", import.meta.url), "utf8");
const login = await readFile(new URL("../src/app/api/auth/login/route.ts", import.meta.url), "utf8");
const logout = await readFile(new URL("../src/app/api/auth/logout/route.ts", import.meta.url), "utf8");

test("operator sessions are opaque, database-backed, HttpOnly, strict, and revocable", () => {
  assert.match(identity, /randomBytes\(32\)/);
  assert.match(identity, /tokenHash\(token\)/);
  assert.match(identity, /INSERT INTO sessions/);
  assert.match(identity, /status = 'REVOKED'/);
  assert.match(session, /httpOnly:\s*true/);
  assert.match(session, /sameSite:\s*"strict"/);
  assert.match(logout, /revokeOperatorSession/);
});

test("credentials use scrypt and failed attempts create a timed lockout", () => {
  assert.match(identity, /SCRYPT/);
  assert.match(identity, /scrypt\(/);
  assert.match(identity, /failed_attempts = failed_attempts \+ 1/);
  assert.match(identity, /INTERVAL '15 minutes'/);
});

test("institution operations use the database session while preserving existing authority actor identity", () => {
  assert.match(operations, /await requireOperator\(request\)/);
  assert.match(operations, /actorId:\s*session\.email/);
  assert.match(operations, /userId:\s*session\.userId/);
  assert.match(operations, /sessionId:\s*session\.sessionId/);
});

test("institution snapshot is protected while relationship view remains available", () => {
  assert.match(snapshot, /if \(!memberView\) await requireOperator\(request\)/);
});

test("login uses database authentication and returns role and permission context", () => {
  assert.match(login, /authenticateOperator/);
  assert.match(login, /roles:\s*authenticated\.operator\.roles/);
  assert.match(login, /permissions:\s*authenticated\.operator\.permissions/);
  assert.match(login, /INVALID_CREDENTIALS/);
});

test("the environment administrator is only a first-user bootstrap path", () => {
  assert.match(identity, /bootstrapEnvironmentAdministrator/);
  assert.match(identity, /bootstrappedFromEnvironment/);
  assert.match(identity, /INSERT INTO user_credentials/);
  assert.match(identity, /role-institution-administrator/);
});

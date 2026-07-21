import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const auth = await readFile(new URL("../src/server/auth/operator-session.ts", import.meta.url), "utf8");
const operations = await readFile(new URL("../src/app/api/filing-office/operations/route.ts", import.meta.url), "utf8");
const snapshot = await readFile(new URL("../src/app/api/filing-office/snapshot/route.ts", import.meta.url), "utf8");
const login = await readFile(new URL("../src/app/api/auth/login/route.ts", import.meta.url), "utf8");

test("operator sessions are signed, HttpOnly, strict, and expire", () => {
  assert.match(auth, /createHmac\("sha256"/);
  assert.match(auth, /timingSafeEqual/);
  assert.match(auth, /httpOnly:\s*true/);
  assert.match(auth, /sameSite:\s*"strict"/);
  assert.match(auth, /expiresAt\s*<=\s*now/);
});

test("institution operations require authentication and derive actor identity from session", () => {
  assert.match(operations, /requireOperator\(request\)/);
  assert.match(operations, /actorId:\s*session\.email/);
});

test("institution snapshot is protected while relationship view remains available", () => {
  assert.match(snapshot, /if \(!memberView\) requireOperator\(request\)/);
});

test("login rejects weak configuration and uses timing-safe comparisons", () => {
  assert.match(login, /configuredPassword\.length < 12/);
  assert.match(login, /timingSafeEqual/);
  assert.match(login, /INVALID_CREDENTIALS/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { authorizeAuthorityGrant, isAuthorityActive } from "../src/server/finance/authority-policy.js";

const now = Date.parse("2026-07-21T12:00:00.000Z");

function activeAdmin(overrides = {}) {
  return {
    id: "authority-1",
    actorId: "admin-actor",
    scope: "INSTITUTION_ADMIN",
    status: "ACTIVE",
    effectiveAt: "2026-07-21T11:00:00.000Z",
    ...overrides,
  };
}

test("first authority can only bootstrap INSTITUTION_ADMIN with the configured token", () => {
  assert.deepEqual(
    authorizeAuthorityGrant({
      authorities: [],
      actorId: "bootstrap-actor",
      requestedScope: "INSTITUTION_ADMIN",
      providedBootstrapToken: "correct-secret",
      configuredBootstrapToken: "correct-secret",
      instant: now,
    }),
    { mode: "BOOTSTRAP", authorityId: undefined },
  );
});

test("bootstrap rejects arbitrary initial scopes", () => {
  assert.throws(
    () =>
      authorizeAuthorityGrant({
        authorities: [],
        actorId: "attacker",
        requestedScope: "PACKAGE_SUBMIT",
        providedBootstrapToken: "correct-secret",
        configuredBootstrapToken: "correct-secret",
        instant: now,
      }),
    /BOOTSTRAP_SCOPE_RESTRICTED/,
  );
});

test("bootstrap rejects missing and invalid tokens", () => {
  assert.throws(
    () =>
      authorizeAuthorityGrant({
        authorities: [],
        actorId: "attacker",
        requestedScope: "INSTITUTION_ADMIN",
        configuredBootstrapToken: "correct-secret",
        instant: now,
      }),
    /INVALID_BOOTSTRAP_TOKEN/,
  );

  assert.throws(
    () =>
      authorizeAuthorityGrant({
        authorities: [],
        actorId: "attacker",
        requestedScope: "INSTITUTION_ADMIN",
        providedBootstrapToken: "wrong-secret",
        configuredBootstrapToken: "correct-secret",
        instant: now,
      }),
    /INVALID_BOOTSTRAP_TOKEN/,
  );
});

test("bootstrap is disabled when the deployment token is not configured", () => {
  assert.throws(
    () =>
      authorizeAuthorityGrant({
        authorities: [],
        actorId: "bootstrap-actor",
        requestedScope: "INSTITUTION_ADMIN",
        providedBootstrapToken: "anything",
        instant: now,
      }),
    /BOOTSTRAP_DISABLED/,
  );
});

test("after bootstrap, only an active institution admin may grant authority", () => {
  const authorities = [activeAdmin()];

  assert.deepEqual(
    authorizeAuthorityGrant({
      authorities,
      actorId: "admin-actor",
      requestedScope: "PACKAGE_CREATE",
      instant: now,
    }),
    { mode: "ADMIN", authorityId: "authority-1" },
  );

  assert.throws(
    () =>
      authorizeAuthorityGrant({
        authorities,
        actorId: "untrusted-actor",
        requestedScope: "PACKAGE_CREATE",
        instant: now,
      }),
    /AUTHORITY_REQUIRED:INSTITUTION_ADMIN/,
  );
});

test("expired, revoked, and future authorities cannot authorize grants", () => {
  const invalidAuthorities = [
    activeAdmin({ expiresAt: "2026-07-21T11:30:00.000Z" }),
    activeAdmin({ status: "REVOKED" }),
    activeAdmin({ effectiveAt: "2026-07-21T13:00:00.000Z" }),
  ];

  for (const authority of invalidAuthorities) {
    assert.equal(isAuthorityActive(authority, "admin-actor", "INSTITUTION_ADMIN", now), false);
    assert.throws(
      () =>
        authorizeAuthorityGrant({
          authorities: [authority],
          actorId: "admin-actor",
          requestedScope: "PACKAGE_CREATE",
          instant: now,
        }),
      /AUTHORITY_REQUIRED:INSTITUTION_ADMIN/,
    );
  }
});

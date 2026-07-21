/**
 * Returns true when an authority is active for the requested actor and scope.
 * @param {{ actorId: string, scope: string, status: string, effectiveAt: string, expiresAt?: string }} authority
 * @param {string} actorId
 * @param {string} scope
 * @param {number} [instant]
 */
export function isAuthorityActive(authority, actorId, scope, instant = Date.now()) {
  return (
    authority.actorId === actorId &&
    authority.scope === scope &&
    authority.status === "ACTIVE" &&
    Date.parse(authority.effectiveAt) <= instant &&
    (!authority.expiresAt || Date.parse(authority.expiresAt) > instant)
  );
}

/**
 * Protects the authority root from self-service escalation.
 *
 * Bootstrap is allowed exactly once, only for the first INSTITUTION_ADMIN,
 * and only when the caller supplies the deployment bootstrap token.
 * After bootstrap, an active INSTITUTION_ADMIN authority is required.
 *
 * @param {{ authorities: Array<{ id: string, actorId: string, scope: string, status: string, effectiveAt: string, expiresAt?: string }>, actorId: string, requestedScope: string, providedBootstrapToken?: string, configuredBootstrapToken?: string, instant?: number }} input
 */
export function authorizeAuthorityGrant(input) {
  const instant = input.instant ?? Date.now();
  const hasAnyAuthority = input.authorities.length > 0;

  if (!hasAnyAuthority) {
    if (input.requestedScope !== "INSTITUTION_ADMIN") {
      throw new Error("BOOTSTRAP_SCOPE_RESTRICTED");
    }
    if (!input.configuredBootstrapToken) {
      throw new Error("BOOTSTRAP_DISABLED");
    }
    if (!input.providedBootstrapToken || input.providedBootstrapToken !== input.configuredBootstrapToken) {
      throw new Error("INVALID_BOOTSTRAP_TOKEN");
    }
    return { mode: "BOOTSTRAP", authorityId: undefined };
  }

  const adminAuthority = input.authorities.find((authority) =>
    isAuthorityActive(authority, input.actorId, "INSTITUTION_ADMIN", instant),
  );

  if (!adminAuthority) {
    throw new Error("AUTHORITY_REQUIRED:INSTITUTION_ADMIN");
  }

  return { mode: "ADMIN", authorityId: adminAuthority.id };
}

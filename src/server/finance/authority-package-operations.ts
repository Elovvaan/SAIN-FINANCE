import { randomUUID } from "node:crypto";
import { authorizeAuthorityGrant } from "./authority-policy.js";
import {
  appendAuditEvent,
  assertAuthority,
  now,
  type Authority,
  type FilingPackage,
  type FilingState,
} from "./filing-office-domain";
import type { FilingOfficeOperationHandler } from "./filing-office-operation-types";

export const handleAuthorityAndPackageOperation: FilingOfficeOperationHandler = ({
  state,
  operation,
  actorId,
  input,
}) => {
  switch (operation) {
    case "grantAuthority": {
      const requestedScope = String(input.scope || "");
      const subjectActorId = String(input.subjectActorId || "");
      const effectiveAt = now();
      const expiresAt = input.expiresAt ? String(input.expiresAt) : undefined;

      if (!requestedScope) throw new Error("MISSING_AUTHORITY_SCOPE");
      if (!subjectActorId) throw new Error("MISSING_AUTHORITY_SUBJECT");
      if (expiresAt) {
        const expiresAtTime = Date.parse(expiresAt);
        if (Number.isNaN(expiresAtTime) || expiresAtTime <= Date.parse(effectiveAt)) {
          throw new Error("INVALID_AUTHORITY_EXPIRY");
        }
      }

      const authorization = authorizeAuthorityGrant({
        authorities: state.authorities,
        actorId,
        requestedScope,
        providedBootstrapToken: input.bootstrapToken ? String(input.bootstrapToken) : undefined,
        configuredBootstrapToken: process.env.SAIN_BOOTSTRAP_TOKEN,
      });

      const authority: Authority = {
        id: randomUUID(),
        actorId: subjectActorId,
        scope: requestedScope,
        status: "ACTIVE",
        effectiveAt,
        expiresAt,
      };
      state.authorities.push(authority);
      appendAuditEvent(
        state,
        actorId,
        operation,
        authority.id,
        undefined,
        `${authorization.mode}:${requestedScope}`,
        authorization.authorityId,
      );
      return {
        actorId: authority.actorId,
        scope: authority.scope,
        status: authority.status,
        effectiveAt: authority.effectiveAt,
        expiresAt: authority.expiresAt,
      };
    }

    case "setBicPrerequisite": {
      const authority = assertAuthority(state, actorId, "INSTITUTION_ADMIN");
      const prerequisite = String(input.prerequisite) as keyof FilingState["institution"]["prerequisites"];
      if (!(prerequisite in state.institution.prerequisites)) throw new Error("UNKNOWN_PREREQUISITE");
      state.institution.prerequisites[prerequisite] = Boolean(input.value);
      appendAuditEvent(state, actorId, operation, prerequisite, undefined, String(input.value), authority.id);
      return state.institution.prerequisites;
    }

    case "createBicApplicationPackage": {
      const authority = assertAuthority(state, actorId, "PACKAGE_CREATE");
      const missing = Object.entries(state.institution.prerequisites)
        .filter(([, value]) => !value)
        .map(([key]) => key);
      if (missing.length) throw new Error(`BIC_PREREQUISITES_MISSING:${missing.join(",")}`);

      const conditional: string[] = [];
      if (input.thirdPartyCustodian) conditional.push("THIRD_PARTY_CUSTODIAN_AGREEMENT");
      if (input.electronicCollateral) conditional.push("ELECTRONIC_COLLATERAL_ATTESTATION");

      const item: FilingPackage = {
        id: randomUUID(),
        ownerType: "INSTITUTION",
        ownerId: state.institution.id,
        type: "BIC_APPLICATION",
        status: "ASSEMBLING",
        requiredDocumentTypes: ["BIC_APPLICATION", "LOAN_POLICY", "RISK_RATING_DEFINITIONS"],
        conditionalDocumentTypes: conditional,
        documentIds: [],
        completionPercentage: 0,
        submissionIds: [],
      };
      state.packages.push(item);
      appendAuditEvent(state, actorId, operation, item.id, undefined, item.status, authority.id);
      return item;
    }

    case "generateMonthlyBicPackage": {
      const authority = assertAuthority(state, actorId, "PACKAGE_CREATE");
      const conditional: string[] = [];
      if (state.collateral.some((item) => item.status === "PLEDGED" && item.creditCardReceivable)) conditional.push("CCR_SUPPORT");
      if (state.collateral.some((item) => item.status === "PLEDGED" && item.electronic)) conditional.push("ELECTRONIC_COLLATERAL_SUPPORT");
      if (state.collateral.some((item) => item.status === "PLEDGED" && item.thirdPartyCustodian)) conditional.push("CUSTODIAN_CERTIFICATION");

      const item: FilingPackage = {
        id: randomUUID(),
        ownerType: "INSTITUTION",
        ownerId: state.institution.id,
        type: "MONTHLY_BIC_COLLATERAL_PACKAGE",
        status: "ASSEMBLING",
        requiredDocumentTypes: ["COLLATERAL_SCHEDULE", "BIC_1", "COLLATERAL_SCHEDULE_CONFIRMATION"],
        conditionalDocumentTypes: conditional,
        documentIds: [],
        completionPercentage: 0,
        submissionIds: [],
      };
      state.packages.push(item);
      appendAuditEvent(state, actorId, operation, item.id, undefined, item.status, authority.id);
      return item;
    }

    default:
      return undefined;
  }
};

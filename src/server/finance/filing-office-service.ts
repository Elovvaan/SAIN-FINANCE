import { randomUUID } from "node:crypto";
import { authorizeAuthorityGrant } from "./authority-policy.js";
import {
  appendAuditEvent,
  assertAuthority,
  checksum,
  computePackageCompletion,
  now,
  type Authority,
  type CollateralRecord,
  type FilingDocument,
  type FilingPackage,
  type FilingState,
  type SubmissionRecord,
} from "./filing-office-domain";
import { getFilingOfficeRepository } from "./filing-office-store";

const SUBMISSION_DESTINATION = "Federal Reserve Bank of San Francisco — 12th District";

function submissionManifest(state: FilingState, packageItem: FilingPackage) {
  return state.documents
    .filter((document) => packageItem.documentIds.includes(document.id))
    .map((document) => ({
      documentId: document.id,
      version: document.versions.at(-1)!.version,
      checksum: document.versions.at(-1)!.checksum,
    }));
}

export async function getFilingOfficeSnapshot(memberView = false) {
  const state = await getFilingOfficeRepository().load();

  if (memberView) {
    return {
      relationship: { name: "My SAIN Relationship" },
      opportunities: [
        { title: "Review a Pending Document", status: "AVAILABLE_NOW" },
        { title: "Continue an Existing Package", status: "REQUIRES_ACTION" },
      ],
      documents: state.documents
        .filter((document) => document.ownerType === "RELATIONSHIP")
        .map(({ id: _id, ownerId: _ownerId, ...document }) => document),
    };
  }

  return {
    institution: {
      name: state.institution.name,
      district: state.institution.district,
      masterAccountStatus: state.institution.masterAccountRecord.status,
      prerequisites: state.institution.prerequisites,
    },
    packages: state.packages,
    documents: state.documents.map(({ versions, ...document }) => ({
      ...document,
      versions: versions.map(({ content: _content, ...version }) => version),
    })),
    collateral: state.collateral,
    submissions: state.submissions,
    auditCount: state.audit.length,
  };
}

export async function runFilingOfficeOperation(input: Record<string, unknown>) {
  const repository = getFilingOfficeRepository();
  const state = await repository.load();
  const operation = String(input.operation || "");
  const actorId = String(input.actorId || "");

  if (!operation) throw new Error("MISSING_OPERATION");
  if (!actorId) throw new Error("MISSING_ACTOR");

  let result: unknown;

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
      result = {
        actorId: authority.actorId,
        scope: authority.scope,
        status: authority.status,
        effectiveAt: authority.effectiveAt,
        expiresAt: authority.expiresAt,
      };
      break;
    }

    case "setBicPrerequisite": {
      const authority = assertAuthority(state, actorId, "INSTITUTION_ADMIN");
      const prerequisite = String(input.prerequisite) as keyof FilingState["institution"]["prerequisites"];
      if (!(prerequisite in state.institution.prerequisites)) throw new Error("UNKNOWN_PREREQUISITE");
      state.institution.prerequisites[prerequisite] = Boolean(input.value);
      appendAuditEvent(state, actorId, operation, prerequisite, undefined, String(input.value), authority.id);
      result = state.institution.prerequisites;
      break;
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
      result = item;
      break;
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
      result = item;
      break;
    }

    case "generateDocument":
    case "regenerateDocumentVersion": {
      const authority = assertAuthority(state, actorId, "DOCUMENT_GENERATE");
      const packageItem = state.packages.find((candidate) => candidate.id === input.packageId);
      if (!packageItem) throw new Error("PACKAGE_NOT_FOUND");

      const existing = state.documents.find(
        (document) => document.packageId === packageItem.id && document.type === input.documentType,
      );
      const content = String(input.content || "");

      if (existing) {
        if (["VERIFIED", "SUBMITTED"].includes(existing.status)) {
          throw new Error("FROZEN_DOCUMENT_REQUIRES_CORRECTION_COPY");
        }
        existing.versions.push({
          version: existing.versions.length + 1,
          content,
          checksum: checksum(content),
          createdAt: now(),
          createdBy: actorId,
          frozen: false,
        });
        appendAuditEvent(
          state,
          actorId,
          operation,
          existing.id,
          String(existing.versions.length - 1),
          String(existing.versions.length),
          authority.id,
        );
        result = existing;
      } else {
        const document: FilingDocument = {
          id: randomUUID(),
          ownerType: packageItem.ownerType,
          ownerId: packageItem.ownerId,
          packageId: packageItem.id,
          type: String(input.documentType),
          title: String(input.title || input.documentType),
          status: "GENERATED",
          templateClass: input.official ? "OFFICIAL_EXTERNAL_TEMPLATE" : "SAIN_INTERNAL_TEMPLATE",
          sourceVerificationRequired: Boolean(input.official),
          versions: [{
            version: 1,
            content,
            checksum: checksum(content),
            createdAt: now(),
            createdBy: actorId,
            frozen: false,
          }],
        };
        state.documents.push(document);
        packageItem.documentIds.push(document.id);
        computePackageCompletion(state, packageItem);
        appendAuditEvent(state, actorId, operation, document.id, undefined, document.status, authority.id);
        result = document;
      }
      break;
    }

    case "requestSignature": {
      const authority = assertAuthority(state, actorId, "SIGNATURE_REQUEST");
      const document = state.documents.find((candidate) => candidate.id === input.documentId);
      if (!document) throw new Error("DOCUMENT_NOT_FOUND");
      const previous = document.status;
      document.status = "AWAITING_SIGNATURE";
      appendAuditEvent(state, actorId, operation, document.id, previous, document.status, authority.id);
      result = document;
      break;
    }

    case "recordSignature": {
      const authority = assertAuthority(state, actorId, "DOCUMENT_SIGN");
      const document = state.documents.find((candidate) => candidate.id === input.documentId);
      if (!document || document.status !== "AWAITING_SIGNATURE") throw new Error("DOCUMENT_NOT_READY_FOR_SIGNATURE");
      const previous = document.status;
      document.status = "SIGNED";
      document.signedBy = actorId;
      document.versions.at(-1)!.frozen = true;
      appendAuditEvent(state, actorId, operation, document.id, previous, document.status, authority.id);
      result = document;
      break;
    }

    case "verifyDocument": {
      const authority = assertAuthority(state, actorId, "DOCUMENT_VERIFY");
      const document = state.documents.find((candidate) => candidate.id === input.documentId);
      if (!document || !["SIGNED", "GENERATED"].includes(document.status)) throw new Error("DOCUMENT_NOT_READY_FOR_VERIFICATION");
      if (document.versions.at(-1)?.createdBy === actorId) throw new Error("CREATOR_CANNOT_VERIFY");
      const previous = document.status;
      document.status = "VERIFIED";
      document.verifiedBy = actorId;
      document.versions.at(-1)!.frozen = true;
      const packageItem = state.packages.find((candidate) => candidate.id === document.packageId);
      if (packageItem) computePackageCompletion(state, packageItem);
      appendAuditEvent(state, actorId, operation, document.id, previous, document.status, authority.id);
      result = document;
      break;
    }

    case "addCollateralRecord": {
      const authority = assertAuthority(state, actorId, "COLLATERAL_ADD");
      const amount = Number(input.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("INVALID_COLLATERAL_AMOUNT");
      const record: CollateralRecord = {
        id: randomUUID(),
        institutionId: state.institution.id,
        description: String(input.description),
        amount,
        status: input.exception ? "EXCEPTION" : "PLEDGED",
        electronic: Boolean(input.electronic),
        creditCardReceivable: Boolean(input.creditCardReceivable),
        thirdPartyCustodian: Boolean(input.thirdPartyCustodian),
        createdAt: now(),
      };
      state.collateral.push(record);
      appendAuditEvent(state, actorId, operation, record.id, undefined, record.status, authority.id);
      result = record;
      break;
    }

    case "withdrawCollateralRecord": {
      const authority = assertAuthority(state, actorId, "COLLATERAL_WITHDRAW");
      const record = state.collateral.find((candidate) => candidate.id === input.collateralId);
      if (!record) throw new Error("COLLATERAL_NOT_FOUND");
      const previous = record.status;
      record.status = "WITHDRAWN";
      record.withdrawnAt = now();
      appendAuditEvent(state, actorId, operation, record.id, previous, record.status, authority.id);
      result = record;
      break;
    }

    case "generateCollateralSchedule": {
      const authority = assertAuthority(state, actorId, "DOCUMENT_GENERATE");
      const records = state.collateral.filter((item) => item.status === "PLEDGED");
      const total = records.reduce((sum, item) => sum + item.amount, 0);
      result = { total, records };
      appendAuditEvent(state, actorId, operation, String(input.packageId), undefined, String(total), authority.id);
      break;
    }

    case "exportSubmissionPackage": {
      const authority = assertAuthority(state, actorId, "PACKAGE_EXPORT");
      const packageItem = state.packages.find((candidate) => candidate.id === input.packageId);
      if (!packageItem) throw new Error("PACKAGE_NOT_FOUND");
      computePackageCompletion(state, packageItem);
      if (packageItem.status !== "READY_FOR_SUBMISSION") throw new Error("PACKAGE_NOT_READY");
      const manifest = submissionManifest(state, packageItem);
      appendAuditEvent(state, actorId, operation, packageItem.id, packageItem.status, packageItem.status, authority.id);
      result = { packageId: packageItem.id, destination: SUBMISSION_DESTINATION, manifest };
      break;
    }

    case "recordSubmission": {
      const authority = assertAuthority(state, actorId, "PACKAGE_SUBMIT");
      const packageItem = state.packages.find((candidate) => candidate.id === input.packageId);
      if (!packageItem) throw new Error("PACKAGE_NOT_FOUND");
      computePackageCompletion(state, packageItem);
      if (packageItem.status !== "READY_FOR_SUBMISSION" && packageItem.status !== "RETURNED") {
        throw new Error("PACKAGE_NOT_READY");
      }

      const submission: SubmissionRecord = {
        id: randomUUID(),
        packageId: packageItem.id,
        destination: SUBMISSION_DESTINATION,
        manifest: submissionManifest(state, packageItem),
        submittedAt: now(),
        submittedBy: actorId,
        status: "SUBMITTED",
      };

      state.submissions.push(submission);
      packageItem.submissionIds.push(submission.id);
      const previous = packageItem.status;
      packageItem.status = "SUBMITTED";
      state.documents
        .filter((document) => packageItem.documentIds.includes(document.id))
        .forEach((document) => {
          document.status = "SUBMITTED";
          document.versions.at(-1)!.frozen = true;
        });
      appendAuditEvent(state, actorId, operation, packageItem.id, previous, packageItem.status, authority.id);
      result = submission;
      break;
    }

    case "recordReceipt":
    case "recordReturn":
    case "recordAcceptance": {
      const authority = assertAuthority(state, actorId, "PACKAGE_ADMIN");
      const packageItem = state.packages.find((candidate) => candidate.id === input.packageId);
      if (!packageItem) throw new Error("PACKAGE_NOT_FOUND");
      const previous = packageItem.status;
      packageItem.status = operation === "recordReceipt" ? "RECEIVED" : operation === "recordReturn" ? "RETURNED" : "ACTIVE";
      if (operation === "recordReturn") packageItem.returnReason = String(input.reason || "Returned for correction");
      const submission = state.submissions.findLast((candidate) => candidate.packageId === packageItem.id);
      if (submission) {
        submission.status = operation === "recordReceipt" ? "RECEIVED" : operation === "recordReturn" ? "RETURNED" : "ACCEPTED";
        submission.reason = input.reason ? String(input.reason) : undefined;
      }
      appendAuditEvent(state, actorId, operation, packageItem.id, previous, packageItem.status, authority.id);
      result = packageItem;
      break;
    }

    default:
      throw new Error("UNKNOWN_OPERATION");
  }

  await repository.save(state);
  return result;
}

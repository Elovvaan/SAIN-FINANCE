import { randomUUID } from "node:crypto";
import {
  appendAuditEvent,
  assertAuthority,
  checksum,
  computePackageCompletion,
  now,
  type FilingDocument,
} from "./filing-office-domain";
import type { FilingOfficeOperationContext } from "./filing-office-operation-types";

const DOCUMENT_OPERATIONS = new Set([
  "generateDocument",
  "regenerateDocumentVersion",
  "requestSignature",
  "recordSignature",
  "verifyDocument",
]);

export function handleDocumentOperation(context: FilingOfficeOperationContext): unknown | undefined {
  const { state, operation, actorId, input } = context;
  if (!DOCUMENT_OPERATIONS.has(operation)) return undefined;

  switch (operation) {
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
        return existing;
      }

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
      return document;
    }

    case "requestSignature": {
      const authority = assertAuthority(state, actorId, "SIGNATURE_REQUEST");
      const document = state.documents.find((candidate) => candidate.id === input.documentId);
      if (!document) throw new Error("DOCUMENT_NOT_FOUND");
      const previous = document.status;
      document.status = "AWAITING_SIGNATURE";
      appendAuditEvent(state, actorId, operation, document.id, previous, document.status, authority.id);
      return document;
    }

    case "recordSignature": {
      const authority = assertAuthority(state, actorId, "DOCUMENT_SIGN");
      const document = state.documents.find((candidate) => candidate.id === input.documentId);
      if (!document || document.status !== "AWAITING_SIGNATURE") {
        throw new Error("DOCUMENT_NOT_READY_FOR_SIGNATURE");
      }
      const previous = document.status;
      document.status = "SIGNED";
      document.signedBy = actorId;
      document.versions.at(-1)!.frozen = true;
      appendAuditEvent(state, actorId, operation, document.id, previous, document.status, authority.id);
      return document;
    }

    case "verifyDocument": {
      const authority = assertAuthority(state, actorId, "DOCUMENT_VERIFY");
      const document = state.documents.find((candidate) => candidate.id === input.documentId);
      if (!document || !["SIGNED", "GENERATED"].includes(document.status)) {
        throw new Error("DOCUMENT_NOT_READY_FOR_VERIFICATION");
      }
      if (document.versions.at(-1)?.createdBy === actorId) throw new Error("CREATOR_CANNOT_VERIFY");
      const previous = document.status;
      document.status = "VERIFIED";
      document.verifiedBy = actorId;
      document.versions.at(-1)!.frozen = true;
      const packageItem = state.packages.find((candidate) => candidate.id === document.packageId);
      if (packageItem) computePackageCompletion(state, packageItem);
      appendAuditEvent(state, actorId, operation, document.id, previous, document.status, authority.id);
      return document;
    }
  }
}

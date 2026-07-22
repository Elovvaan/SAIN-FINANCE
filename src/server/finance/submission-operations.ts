import { randomUUID } from "node:crypto";
import {
  appendAuditEvent,
  assertAuthority,
  computePackageCompletion,
  now,
  type FilingPackage,
  type FilingState,
  type SubmissionRecord,
} from "./filing-office-domain";
import type { FilingOfficeOperationContext } from "./filing-office-operation-types";

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

export function handleSubmissionOperation({
  state,
  operation,
  actorId,
  input,
}: FilingOfficeOperationContext): unknown | undefined {
  switch (operation) {
    case "exportSubmissionPackage": {
      const authority = assertAuthority(state, actorId, "PACKAGE_EXPORT");
      const packageItem = state.packages.find((candidate) => candidate.id === input.packageId);
      if (!packageItem) throw new Error("PACKAGE_NOT_FOUND");

      computePackageCompletion(state, packageItem);
      if (packageItem.status !== "READY_FOR_SUBMISSION") throw new Error("PACKAGE_NOT_READY");

      const manifest = submissionManifest(state, packageItem);
      appendAuditEvent(
        state,
        actorId,
        operation,
        packageItem.id,
        packageItem.status,
        packageItem.status,
        authority.id,
      );

      return {
        packageId: packageItem.id,
        destination: SUBMISSION_DESTINATION,
        manifest,
      };
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

      appendAuditEvent(
        state,
        actorId,
        operation,
        packageItem.id,
        previous,
        packageItem.status,
        authority.id,
      );

      return submission;
    }

    case "recordReceipt":
    case "recordReturn":
    case "recordAcceptance": {
      const authority = assertAuthority(state, actorId, "PACKAGE_ADMIN");
      const packageItem = state.packages.find((candidate) => candidate.id === input.packageId);
      if (!packageItem) throw new Error("PACKAGE_NOT_FOUND");

      const previous = packageItem.status;
      packageItem.status =
        operation === "recordReceipt"
          ? "RECEIVED"
          : operation === "recordReturn"
            ? "RETURNED"
            : "ACTIVE";

      if (operation === "recordReturn") {
        packageItem.returnReason = String(input.reason || "Returned for correction");
      }

      const submission = state.submissions.findLast(
        (candidate) => candidate.packageId === packageItem.id,
      );

      if (submission) {
        submission.status =
          operation === "recordReceipt"
            ? "RECEIVED"
            : operation === "recordReturn"
              ? "RETURNED"
              : "ACCEPTED";
        submission.reason = input.reason ? String(input.reason) : undefined;
      }

      appendAuditEvent(
        state,
        actorId,
        operation,
        packageItem.id,
        previous,
        packageItem.status,
        authority.id,
      );

      return packageItem;
    }

    default:
      return undefined;
  }
}

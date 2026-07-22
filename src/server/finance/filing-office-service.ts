import { handleAuthorityAndPackageOperation } from "./authority-package-operations";
import { handleCollateralOperation } from "./collateral-operations";
import { handleDocumentOperation } from "./document-operations";
import { getFilingOfficeRepository } from "./filing-office-store";
import { handleSubmissionOperation } from "./submission-operations";

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

  const context = { state, operation, actorId, input };
  const result =
    handleAuthorityAndPackageOperation(context) ??
    handleDocumentOperation(context) ??
    handleCollateralOperation(context) ??
    handleSubmissionOperation(context);

  if (result === undefined) throw new Error("UNKNOWN_OPERATION");

  await repository.save(state);
  return result;
}

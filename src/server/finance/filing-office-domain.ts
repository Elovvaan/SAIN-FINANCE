import { createHash, randomUUID } from "node:crypto";
import { isAuthorityActive } from "./authority-policy.js";

export type OwnerType = "INSTITUTION" | "RELATIONSHIP";
export type PackageStatus =
  | "ASSEMBLING"
  | "REQUIRES_ACTION"
  | "AWAITING_SIGNATURE"
  | "READY_FOR_VERIFICATION"
  | "READY_FOR_SUBMISSION"
  | "SUBMITTED"
  | "RECEIVED"
  | "RETURNED"
  | "ACTIVE"
  | "ARCHIVED";

export type DocumentStatus =
  | "GENERATED"
  | "AWAITING_SIGNATURE"
  | "SIGNED"
  | "VERIFIED"
  | "SUBMITTED"
  | "RETURNED"
  | "ARCHIVED";

export interface Authority {
  id: string;
  actorId: string;
  scope: string;
  status: "ACTIVE" | "PENDING" | "EXPIRED" | "REVOKED" | "SUPERSEDED";
  effectiveAt: string;
  expiresAt?: string;
}

export interface DocumentVersion {
  version: number;
  content: string;
  checksum: string;
  createdAt: string;
  createdBy: string;
  frozen: boolean;
}

export interface FilingDocument {
  id: string;
  ownerType: OwnerType;
  ownerId: string;
  packageId?: string;
  type: string;
  title: string;
  status: DocumentStatus;
  templateClass: "OFFICIAL_EXTERNAL_TEMPLATE" | "SAIN_INTERNAL_TEMPLATE";
  sourceVerificationRequired: boolean;
  versions: DocumentVersion[];
  signedBy?: string;
  verifiedBy?: string;
}

export interface FilingPackage {
  id: string;
  ownerType: OwnerType;
  ownerId: string;
  type: string;
  status: PackageStatus;
  requiredDocumentTypes: string[];
  conditionalDocumentTypes: string[];
  documentIds: string[];
  completionPercentage: number;
  submissionIds: string[];
  returnReason?: string;
}

export interface CollateralRecord {
  id: string;
  institutionId: string;
  description: string;
  amount: number;
  status: "PLEDGED" | "WITHDRAWN" | "EXCEPTION";
  electronic: boolean;
  creditCardReceivable: boolean;
  thirdPartyCustodian: boolean;
  createdAt: string;
  withdrawnAt?: string;
}

export interface SubmissionRecord {
  id: string;
  packageId: string;
  destination: string;
  manifest: Array<{ documentId: string; version: number; checksum: string }>;
  submittedAt: string;
  submittedBy: string;
  status: "SUBMITTED" | "RECEIVED" | "RETURNED" | "ACCEPTED";
  reason?: string;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  operation: string;
  targetId: string;
  at: string;
  previousState?: string;
  resultingState?: string;
  authorityId?: string;
}

export interface FilingState {
  schemaVersion: 1;
  institution: {
    id: string;
    name: string;
    district: string;
    masterAccountRecord: { id: string; status: "PREPARATION" | "ACTIVE" };
    prerequisites: {
      oc10LetterOfAgreement: boolean;
      borrowingResolution: boolean;
      oc10AuthorizationList: boolean;
    };
  };
  authorities: Authority[];
  documents: FilingDocument[];
  packages: FilingPackage[];
  collateral: CollateralRecord[];
  submissions: SubmissionRecord[];
  audit: AuditEvent[];
}

export function now() {
  return new Date().toISOString();
}

export function checksum(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

export function createInitialFilingState(): FilingState {
  return {
    schemaVersion: 1,
    institution: {
      id: "sain-institution",
      name: "SAIN Finance",
      district: "12th District",
      masterAccountRecord: { id: randomUUID(), status: "PREPARATION" },
      prerequisites: {
        oc10LetterOfAgreement: false,
        borrowingResolution: false,
        oc10AuthorizationList: false,
      },
    },
    authorities: [],
    documents: [],
    packages: [],
    collateral: [],
    submissions: [],
    audit: [],
  };
}

export function validateFilingState(value: unknown): FilingState {
  if (!value || typeof value !== "object") throw new Error("INVALID_STORE");
  const state = value as FilingState;
  if (state.schemaVersion !== 1) throw new Error("UNSUPPORTED_STORE_VERSION");
  if (
    !state.institution ||
    !Array.isArray(state.authorities) ||
    !Array.isArray(state.documents) ||
    !Array.isArray(state.packages) ||
    !Array.isArray(state.collateral) ||
    !Array.isArray(state.submissions) ||
    !Array.isArray(state.audit)
  ) {
    throw new Error("INVALID_STORE_SHAPE");
  }
  return state;
}

export function assertAuthority(state: FilingState, actorId: string, scope: string): Authority {
  const authority = state.authorities.find((candidate) =>
    isAuthorityActive(candidate, actorId, scope),
  );
  if (!authority) throw new Error(`AUTHORITY_REQUIRED:${scope}`);
  return authority;
}

export function appendAuditEvent(
  state: FilingState,
  actorId: string,
  operation: string,
  targetId: string,
  previousState?: string,
  resultingState?: string,
  authorityId?: string,
) {
  state.audit.push({
    id: randomUUID(),
    actorId,
    operation,
    targetId,
    at: now(),
    previousState,
    resultingState,
    authorityId,
  });
}

export function computePackageCompletion(state: FilingState, item: FilingPackage) {
  const required = [...item.requiredDocumentTypes, ...item.conditionalDocumentTypes];
  const documents = state.documents.filter((document) => item.documentIds.includes(document.id));
  const complete = required.filter((type) =>
    documents.some(
      (document) => document.type === type && ["VERIFIED", "SUBMITTED"].includes(document.status),
    ),
  ).length;
  item.completionPercentage = required.length === 0 ? 100 : Math.floor((complete / required.length) * 100);
  if (!["SUBMITTED", "RECEIVED", "RETURNED", "ACTIVE"].includes(item.status)) {
    item.status = item.completionPercentage === 100 ? "READY_FOR_SUBMISSION" : "REQUIRES_ACTION";
  }
}

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { authorizeAuthorityGrant, isAuthorityActive } from "./authority-policy.js";

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

interface FilingState {
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

const DATA_DIRECTORY = process.env.SAIN_DATA_DIR || path.join(process.cwd(), ".sain-data");
const STORE_FILE = path.join(DATA_DIRECTORY, "filing-office.json");
const BACKUP_FILE = path.join(DATA_DIRECTORY, "filing-office.backup.json");

function now() {
  return new Date().toISOString();
}

function checksum(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function initialState(): FilingState {
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

function validateState(value: unknown): FilingState {
  if (!value || typeof value !== "object") throw new Error("INVALID_STORE");
  const state = value as FilingState;
  if (state.schemaVersion !== 1) throw new Error("UNSUPPORTED_STORE_VERSION");
  if (!Array.isArray(state.documents) || !Array.isArray(state.packages) || !Array.isArray(state.audit)) {
    throw new Error("INVALID_STORE_SHAPE");
  }
  return state;
}

async function loadState(): Promise<FilingState> {
  await mkdir(DATA_DIRECTORY, { recursive: true });
  try {
    return validateState(JSON.parse(await readFile(STORE_FILE, "utf8")));
  } catch {
    try {
      return validateState(JSON.parse(await readFile(BACKUP_FILE, "utf8")));
    } catch {
      return initialState();
    }
  }
}

async function saveState(state: FilingState) {
  await mkdir(DATA_DIRECTORY, { recursive: true });
  const temporary = `${STORE_FILE}.${randomUUID()}.tmp`;
  const serialized = JSON.stringify(state, null, 2);
  try {
    const current = await readFile(STORE_FILE, "utf8");
    await writeFile(BACKUP_FILE, current, "utf8");
  } catch {
    // No existing store yet.
  }
  await writeFile(temporary, serialized, "utf8");
  await rename(temporary, STORE_FILE);
}

function assertAuthority(state: FilingState, actorId: string, scope: string): Authority {
  const authority = state.authorities.find((candidate) =>
    isAuthorityActive(candidate, actorId, scope),
  );
  if (!authority) throw new Error(`AUTHORITY_REQUIRED:${scope}`);
  return authority;
}

function audit(
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

function computePackage(state: FilingState, item: FilingPackage) {
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

export async function getFilingOfficeSnapshot(memberView = false) {
  const state = await loadState();
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
  const state = await loadState();
  const operation = String(input.operation || "");
  const actorId = String(input.actorId || "");
  if (!operation) throw new Error("MISSING_OPERATION");
  if (!actorId) throw new Error("MISSING_ACTOR");

  let result: unknown;

  switch (operation) {
    case "grantAuthority": {
      const requestedScope = String(input.scope || "");
      const subjectActorId = String(input.subjectActorId || "");
      if (!requestedScope) throw new Error("MISSING_AUTHORITY_SCOPE");
      if (!subjectActorId) throw new Error("MISSING_AUTHORITY_SUBJECT");

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
        effectiveAt: now(),
        expiresAt: input.expiresAt ? String(input.expiresAt) : undefined,
      };
      state.authorities.push(authority);
      audit(
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
      audit(state, actorId, operation, prerequisite, undefined, String(input.value), authority.id);
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
      audit(state, actorId, operation, item.id, undefined, item.status, authority.id);
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
      audit(state, actorId, operation, item.id, undefined, item.status, authority.id);
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
        audit(state, actorId, operation, existing.id, String(existing.versions.length - 1), String(existing.versions.length), authority.id);
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
        computePackage(state, packageItem);
        audit(state, actorId, operation, document.id, undefined, document.status, authority.id);
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
      audit(state, actorId, operation, document.id, previous, document.status, authority.id);
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
      audit(state, actorId, operation, document.id, previous, document.status, authority.id);
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
      if (packageItem) computePackage(state, packageItem);
      audit(state, actorId, operation, document.id, previous, document.status, authority.id);
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
      audit(state, actorId, operation, record.id, undefined, record.status, authority.id);
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
      audit(state, actorId, operation, record.id, previous, record.status, authority.id);
      result = record;
      break;
    }
    case "generateCollateralSchedule": {
      const authority = assertAuthority(state, actorId, "DOCUMENT_GENERATE");
      const records = state.collateral.filter((item) => item.status === "PLEDGED");
      const total = records.reduce((sum, item) => sum + item.amount, 0);
      result = { total, records };
      audit(state, actorId, operation, String(input.packageId), undefined, String(total), authority.id);
      break;
    }
    case "exportSubmissionPackage": {
      const authority = assertAuthority(state, actorId, "PACKAGE_EXPORT");
      const packageItem = state.packages.find((candidate) => candidate.id === input.packageId);
      if (!packageItem) throw new Error("PACKAGE_NOT_FOUND");
      computePackage(state, packageItem);
      if (packageItem.status !== "READY_FOR_SUBMISSION") throw new Error("PACKAGE_NOT_READY");
      const manifest = state.documents
        .filter((document) => packageItem.documentIds.includes(document.id))
        .map((document) => ({
          documentId: document.id,
          version: document.versions.at(-1)!.version,
          checksum: document.versions.at(-1)!.checksum,
        }));
      audit(state, actorId, operation, packageItem.id, packageItem.status, packageItem.status, authority.id);
      result = {
        packageId: packageItem.id,
        destination: "Federal Reserve Bank of San Francisco — 12th District",
        manifest,
      };
      break;
    }
    case "recordSubmission": {
      const authority = assertAuthority(state, actorId, "PACKAGE_SUBMIT");
      const packageItem = state.packages.find((candidate) => candidate.id === input.packageId);
      if (!packageItem) throw new Error("PACKAGE_NOT_FOUND");
      computePackage(state, packageItem);
      if (packageItem.status !== "READY_FOR_SUBMISSION" && packageItem.status !== "RETURNED") {
        throw new Error("PACKAGE_NOT_READY");
      }
      const manifest = state.documents
        .filter((document) => packageItem.documentIds.includes(document.id))
        .map((document) => ({
          documentId: document.id,
          version: document.versions.at(-1)!.version,
          checksum: document.versions.at(-1)!.checksum,
        }));
      const submission: SubmissionRecord = {
        id: randomUUID(),
        packageId: packageItem.id,
        destination: "Federal Reserve Bank of San Francisco — 12th District",
        manifest,
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
      audit(state, actorId, operation, packageItem.id, previous, packageItem.status, authority.id);
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
      audit(state, actorId, operation, packageItem.id, previous, packageItem.status, authority.id);
      result = packageItem;
      break;
    }
    default:
      throw new Error("UNKNOWN_OPERATION");
  }

  await saveState(state);
  return result;
}

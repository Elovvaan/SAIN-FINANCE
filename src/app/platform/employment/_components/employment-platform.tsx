"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  Database,
  FileCheck2,
  FileText,
  Fingerprint,
  Gauge,
  GraduationCap,
  Landmark,
  LineChart,
  LockKeyhole,
  MapPin,
  MessageSquareWarning,
  PackageCheck,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  Workflow,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type EventType =
  | "Off-cycle pay"
  | "Bonus"
  | "Reimbursement"
  | "Payroll correction"
  | "Final paycheck"
  | "New-hire advance";

type EventState = "accepted" | "rejected" | "pending" | "held";
type LedgerSourceWorkspace = "Employer" | "Employee" | "Assets" | "Treasury" | "Admin" | "Partner";
type LedgerEventCategory =
  | "payroll"
  | "funding"
  | "disbursement"
  | "correction"
  | "settlement"
  | "escrow"
  | "issuance"
  | "redemption"
  | "treasury"
  | "reconciliation"
  | "reversal";
type LedgerEventStatus =
  | "draft"
  | "pending"
  | "awaiting_authorization"
  | "authorized"
  | "rejected"
  | "recorded"
  | "failed"
  | "reversed"
  | "cancelled";
type LedgerAuthorizationState =
  | "not_required"
  | "required"
  | "awaiting_authorization"
  | "authorized"
  | "rejected"
  | "not_configured";

type LedgerEvent = {
  ledgerEventId: string;
  eventType: string;
  eventCategory: LedgerEventCategory;
  sourceWorkspace: LedgerSourceWorkspace;
  sourceRecordId: string;
  employerId: string | null;
  employeeId: string | null;
  assetProgramId: string | null;
  treasuryRecordId: string | null;
  debitAccountId: string | null;
  creditAccountId: string | null;
  amount: number | null;
  currencyOrAssetCode: string | null;
  status: LedgerEventStatus;
  authorizationState: LedgerAuthorizationState;
  effectiveAt: string | null;
  recordedAt: string | null;
  recordedBy: string | null;
  description: string;
  metadata: Record<string, string | number | boolean | null>;
  reversalOf: string | null;
  sandbox: boolean;
};

type LedgerFilters = {
  workspace: LedgerSourceWorkspace | "All";
  category: LedgerEventCategory | "All";
  status: LedgerEventStatus | "All";
  employer: string;
  employee: string;
  asset: string;
  date: string;
  ledgerEventId: string;
};

export type EmploymentRouteId =
  | "employer"
  | "employee"
  | "intake"
  | "kernel"
  | "ledger"
  | "assets"
  | "treasury"
  | "admin"
  | "partner"
  | "career";

type AssetProgramStatus = "Design stage";
type AssetProgram = {
  name: string;
  type: string;
  purpose: string;
  status: AssetProgramStatus;
  liveIssuance: "Disabled";
};

type InternalWallet = {
  id: string;
  label: string;
  authority: string;
  state: "Sandbox only" | "Inactive";
};

type TreasuryPosition = {
  id: string;
  label: string;
  value: string;
  state: "Empty";
};

type TreasuryRequest = {
  id: string;
  type: "Issuance" | "Redemption";
  status: "None submitted";
};

type AuthorizationState = {
  control: string;
  status: "Not configured" | "Inactive";
};

type SandboxEvent = {
  id: string;
  employee: string;
  type: EventType;
  amount: number;
  state: EventState;
  note: string;
  timestamp: string;
};

type EmployerActivityEventType =
  | "employer created"
  | "employee added"
  | "payroll prepared"
  | "payroll approved"
  | "funding instruction created"
  | "disbursement initiated"
  | "correction requested"
  | "settlement instruction created"
  | "settlement completed"
  | "settlement reversed";

type EmployerActivityEvent = {
  eventId: string;
  employerId: string;
  eventType: EmployerActivityEventType;
  timestamp: string;
  actor: string;
  relatedRecordId: string;
  status: EventState;
  sourceWorkspace: "Employer";
  ledgerReference: string | null;
  description: string;
};

const eventTypes: EventType[] = [
  "Off-cycle pay",
  "Bonus",
  "Reimbursement",
  "Payroll correction",
  "Final paycheck",
  "New-hire advance",
];

const employmentTabs: { label: string; id: EmploymentRouteId; href: string }[] = [
  { label: "Employer", id: "employer", href: "/platform/employment/employer" },
  { label: "Employee", id: "employee", href: "/platform/employment/employee" },
  { label: "Intake", id: "intake", href: "/platform/employment/intake" },
  { label: "Kernel", id: "kernel", href: "/platform/employment/kernel" },
  { label: "Ledger", id: "ledger", href: "/platform/employment/ledger" },
  { label: "Assets", id: "assets", href: "/platform/employment/assets" },
  { label: "Treasury", id: "treasury", href: "/platform/employment/treasury" },
  { label: "Admin", id: "admin", href: "/platform/employment/admin" },
  { label: "Partner", id: "partner", href: "/platform/employment/partner" },
  { label: "Career", id: "career", href: "/platform/employment/career" },
];

const employmentPageProfiles: Record<
  EmploymentRouteId,
  { eyebrow: string; title: string; copy: string; workspaceLabel: string }
> = {
  employer: {
    eyebrow: "Employer operating workspace",
    title: "Employer financial operations",
    copy: "Company profile, employee records, payroll activity, funding instructions, pending disbursements, correction requests, settlement activity, and employer financial history for the SAIN Finance sandbox.",
    workspaceLabel: "Employer workspace",
  },
  employee: {
    eyebrow: "Employee pay workspace",
    title: "Employee paycheck readiness",
    copy: "A worker-facing view of pay events, current standing, pay-account readiness mocks, and employee activity history before live banking rails exist.",
    workspaceLabel: "Employee workspace",
  },
  intake: {
    eyebrow: "Claim intake workspace",
    title: "Sandbox claim submission",
    copy: "Employer-submitted pay claims, intake states, validation previews, and provenance fields before any real payroll or money movement.",
    workspaceLabel: "Pay event intake",
  },
  kernel: {
    eyebrow: "Financial truth workspace",
    title: "Financial Kernel simulator",
    copy: "A focused view of how sandbox claims pass through validation, admission, commit, projection, and response before balances can change.",
    workspaceLabel: "Kernel simulator",
  },
  ledger: {
    eyebrow: "Ledger workspace",
    title: "Append-only ledger sandbox",
    copy: "Admitted sandbox events become double-entry-style ledger records, balance projections, and event history. Rejected claims do not enter the ledger.",
    workspaceLabel: "Ledger sandbox",
  },
  assets: {
    eyebrow: "Digital asset operating workspace",
    title: "Assets and settlement",
    copy: "Digital asset records, internal wallets, settlement instructions, escrow positions, and asset activity for the SAIN Finance sandbox.",
    workspaceLabel: "Assets workspace",
  },
  treasury: {
    eyebrow: "Treasury operating workspace",
    title: "Treasury and reserves",
    copy: "Internal treasury controls, simulated reserve positions, issuance requests, redemption requests, wallet authority, and reconciliation activity.",
    workspaceLabel: "Treasury workspace",
  },
  admin: {
    eyebrow: "Operations control workspace",
    title: "Admin review console",
    copy: "Manual review, held events, correction workflow, risk flags, restriction mocks, and audit history for internal operations.",
    workspaceLabel: "Admin console",
  },
  partner: {
    eyebrow: "Partner readiness workspace",
    title: "Sponsor-bank readiness",
    copy: "Integration boundaries, readiness checks, partner data contracts, and sandbox limits for bank, BaaS, payroll, and infrastructure conversations.",
    workspaceLabel: "Partner readiness",
  },
  career: {
    eyebrow: "Worker-owned career workspace",
    title: "Career and paycheck readiness",
    copy: "A Career OS preview that connects job onboarding, first-paycheck preparation, worker documents, skills, and the employee path into SAIN Finance.",
    workspaceLabel: "Career OS",
  },
};

const employees = [
  { name: "Maya Ellis", role: "Operations Lead", status: "Active", expected: "$2,840.00" },
  { name: "Jordan Price", role: "Field Technician", status: "Pending correction", expected: "$1,925.50" },
  { name: "Avery Chen", role: "Payroll Specialist", status: "Active", expected: "$2,410.00" },
  { name: "Noah Brooks", role: "New hire", status: "Advance eligible", expected: "$1,100.00" },
];

const activity = [
  "Employer profile updated for Greenwood Logistics",
  "Payroll correction opened for Jordan Price",
  "Sandbox bonus event admitted to ledger",
  "Admin review marked reimbursement as held",
];

const employerActivityEvents: EmployerActivityEvent[] = [];

const employerOperationSections = [
  "Overview",
  "Employees",
  "Payroll",
  "Funding",
  "Disbursements",
  "Settlement",
  "Corrections",
  "Activity",
] as const;

const payTimeline = [
  { label: "Expected payroll", value: "$2,840.00", status: "Projected" },
  { label: "Off-cycle event", value: "$420.00", status: "Pending kernel" },
  { label: "Correction window", value: "Open", status: "Reviewable" },
];

const employeeActivity = [
  "Expected paycheck projection refreshed from admitted sandbox events",
  "Pay-account readiness remains in sandbox review",
  "Support entry point opened for payroll correction question",
  "Profile standing confirmed as active employee mock",
];

const intakeEvidenceFields = [
  { label: "Source system", value: "Employer workspace mock" },
  { label: "Submitted by", value: "Payroll ops user" },
  { label: "Evidence packet", value: "Timesheet + correction note" },
  { label: "Provenance hash", value: "SANDBOX-ONLY-4F29" },
];

const assetPrograms: AssetProgram[] = [
  {
    name: "SAIN USD",
    type: "Sandbox settlement asset",
    purpose: "Models dollar-denominated internal settlement",
    status: "Design stage",
    liveIssuance: "Disabled",
  },
  {
    name: "SAIN Network Asset",
    type: "Sandbox ecosystem asset",
    purpose: "Models platform participation and network functions",
    status: "Design stage",
    liveIssuance: "Disabled",
  },
];

const internalWallets: InternalWallet[] = [
  { id: "WLT-01", label: "Settlement instruction wallet", authority: "Treasury design", state: "Sandbox only" },
  { id: "WLT-02", label: "Escrow position wallet", authority: "Treasury design", state: "Sandbox only" },
  { id: "WLT-03", label: "Program reserve wallet", authority: "Treasury design", state: "Inactive" },
  { id: "WLT-04", label: "Redemption review wallet", authority: "Treasury design", state: "Inactive" },
  { id: "WLT-05", label: "Employer settlement wallet", authority: "Operations design", state: "Sandbox only" },
  { id: "WLT-06", label: "Network activity wallet", authority: "Operations design", state: "Inactive" },
];

const treasuryPositions: TreasuryPosition[] = [];
const issuanceRequests: TreasuryRequest[] = [];
const redemptionRequests: TreasuryRequest[] = [];

const authorizationStates: AuthorizationState[] = [
  { control: "Reserve movement approval", status: "Not configured" },
  { control: "Issuance authorization policy", status: "Not configured" },
  { control: "Redemption authorization policy", status: "Not configured" },
  { control: "Wallet authority review", status: "Inactive" },
];

const baseEvents: SandboxEvent[] = [
  {
    id: "SP-1029",
    employee: "Maya Ellis",
    type: "Bonus",
    amount: 450,
    state: "accepted",
    note: "Quarterly performance bonus",
    timestamp: "2026-06-25 11:42",
  },
  {
    id: "SP-1030",
    employee: "Jordan Price",
    type: "Payroll correction",
    amount: 185.5,
    state: "held",
    note: "Requires employer confirmation",
    timestamp: "2026-06-25 11:48",
  },
  {
    id: "SP-1031",
    employee: "Noah Brooks",
    type: "New-hire advance",
    amount: 300,
    state: "pending",
    note: "Sandbox policy review",
    timestamp: "2026-06-25 11:53",
  },
];

const partnerBuiltNow = [
  "Employer workflows",
  "Employee workflows",
  "Kernel simulation",
  "Ledger sandbox",
  "Admin review",
  "APIs mock",
];

const partnerRequired = [
  "Routing/account numbers",
  "Live ACH/FedNow",
  "Custody of funds",
  "Real reconciliation",
  "Compliance operations",
  "Card issuing",
];

const employmentHistory = [
  {
    employer: "Greenwood Logistics",
    role: "Operations Lead",
    dates: "2024 - Current",
    status: "Verified",
    payGrowth: "+18% pay growth since prior role",
  },
  {
    employer: "Mountain Freight",
    role: "Shift Supervisor",
    dates: "2021 - 2024",
    status: "Verified",
    payGrowth: "+22% growth from warehouse associate",
  },
  {
    employer: "Northline Warehouse",
    role: "Warehouse Associate",
    dates: "2019 - 2021",
    status: "Verified",
    payGrowth: "Baseline role in verified timeline",
  },
];

const skillsPassport = [
  { skill: "Forklift certified", status: "Verified" },
  { skill: "Team leadership", status: "Verified" },
  { skill: "Payroll operations", status: "Pending" },
  { skill: "Safety training", status: "Verified" },
  { skill: "Route coordination", status: "Verified" },
  { skill: "Customer service", status: "Pending" },
];

const workerDocuments = [
  "W-2",
  "Pay statements",
  "Training certificates",
  "Employment verification letter",
  "Resume draft",
];

const careerPaths = [
  {
    title: "Operations Supervisor",
    why: "Matches verified leadership history and logistics operations experience.",
    pay: "$62K - $78K mock range",
    gap: "Advanced scheduling systems",
  },
  {
    title: "Logistics Coordinator",
    why: "Builds on route coordination, dispatch exposure, and warehouse workflow knowledge.",
    pay: "$54K - $68K mock range",
    gap: "TMS platform certification",
  },
  {
    title: "Payroll Assistant",
    why: "Connects payroll correction familiarity with employee operations experience.",
    pay: "$48K - $58K mock range",
    gap: "Payroll compliance basics",
  },
  {
    title: "Safety Lead",
    why: "Uses verified safety training and floor leadership experience.",
    pay: "$56K - $70K mock range",
    gap: "OSHA 30 credential",
  },
];

const jobMatches = [
  {
    title: "Operations Supervisor",
    company: "Pioneer Distribution",
    location: "Denver, CO",
    pay: "$64K - $76K mock",
    match: "91%",
  },
  {
    title: "Logistics Coordinator",
    company: "Front Range Freight",
    location: "Aurora, CO",
    pay: "$55K - $66K mock",
    match: "87%",
  },
  {
    title: "Warehouse Lead",
    company: "Summit Supply Co.",
    location: "Lakewood, CO",
    pay: "$52K - $61K mock",
    match: "84%",
  },
  {
    title: "Payroll Coordinator",
    company: "Civic Staffing Partners",
    location: "Remote / Denver",
    pay: "$50K - $60K mock",
    match: "78%",
  },
];

const careerBuiltNow = [
  "Career profile",
  "Timeline",
  "Skills passport",
  "Mock job matches",
  "Resume/document vault",
  "Career recommendations",
];

const careerPartnerRequired = [
  "Live job feeds",
  "Staffing agency submission",
  "Verified certification sync",
  "Employer hiring pipelines",
  "Application status tracking",
];

const futureCareerIntegrations = [
  "Staffing agencies",
  "Employer career pages",
  "Workforce development programs",
  "Certification providers",
  "Resume builders",
  "Interview prep tools",
];

const kernelSteps = [
  { label: "Claim", icon: FileText },
  { label: "Validation", icon: ShieldCheck },
  { label: "Admission", icon: Fingerprint },
  { label: "Commit", icon: FileCheck2 },
  { label: "Ledger", icon: Database },
  { label: "Projection", icon: LineChart },
  { label: "Response", icon: Workflow },
];

function currency(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function stateTone(state: EventState) {
  if (state === "accepted") return "border-emerald-300/35 text-emerald-200 bg-emerald-400/[0.08]";
  if (state === "rejected") return "border-red-300/30 text-red-200 bg-red-400/[0.08]";
  if (state === "held") return "border-amber-300/30 text-amber-200 bg-amber-400/[0.08]";
  return "border-slate-300/25 text-slate-200 bg-white/[0.05]";
}

function ledgerStatusTone(status: LedgerEventStatus) {
  if (status === "recorded" || status === "authorized") return "border-emerald-300/35 text-emerald-200 bg-emerald-400/[0.08]";
  if (status === "rejected" || status === "failed" || status === "cancelled") return "border-red-300/30 text-red-200 bg-red-400/[0.08]";
  if (status === "awaiting_authorization" || status === "pending") return "border-amber-300/30 text-amber-200 bg-amber-400/[0.08]";
  if (status === "reversed") return "border-slate-300/30 text-slate-200 bg-white/[0.06]";
  return "border-white/10 text-slate-300 bg-white/[0.035]";
}

function LedgerStatusPill({ status }: { status: LedgerEventStatus }) {
  return (
    <span className={`inline-flex border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${ledgerStatusTone(status)}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function employeeIdForName(name: string) {
  return `EMPLOYEE-${name.toUpperCase().replaceAll(" ", "-")}`;
}

function canonicalLedgerEventsFromSandbox(events: SandboxEvent[]): LedgerEvent[] {
  const payrollEvents: LedgerEvent[] = events.map((event) => {
    const recorded = event.state === "accepted";

    return {
      ledgerEventId: `LE-${event.id}`,
      eventType: event.type,
      eventCategory: event.type === "Payroll correction" ? "correction" : "payroll",
      sourceWorkspace: "Employer",
      sourceRecordId: event.id,
      employerId: "EMP-GREENWOOD",
      employeeId: employeeIdForName(event.employee),
      assetProgramId: null,
      treasuryRecordId: null,
      debitAccountId: recorded ? "acct-employer-payroll-clearing" : null,
      creditAccountId: recorded ? `acct-${employeeIdForName(event.employee).toLowerCase()}-pay-projection` : null,
      amount: event.amount,
      currencyOrAssetCode: "USD",
      status: recorded ? "recorded" : event.state === "rejected" ? "rejected" : "pending",
      authorizationState: recorded ? "authorized" : event.state === "held" ? "awaiting_authorization" : "required",
      effectiveAt: recorded ? event.timestamp : null,
      recordedAt: recorded ? event.timestamp : null,
      recordedBy: recorded ? "SAIN sandbox ledger" : null,
      description: recorded
        ? `${event.type} admitted from Employer workspace and recorded as sandbox ledger data.`
        : `${event.type} remains an operational request and has not become a recorded financial event.`,
      metadata: {
        employee: event.employee,
        note: event.note,
        originalSandboxState: event.state,
        demoRecord: true,
      },
      reversalOf: null,
      sandbox: true,
    };
  });

  const operationalExamples: LedgerEvent[] = [
    {
      ledgerEventId: "LE-ASSET-DRAFT-001",
      eventType: "Asset program design record",
      eventCategory: "issuance",
      sourceWorkspace: "Assets",
      sourceRecordId: "SAIN-USD",
      employerId: null,
      employeeId: null,
      assetProgramId: "SAIN-USD",
      treasuryRecordId: null,
      debitAccountId: null,
      creditAccountId: null,
      amount: null,
      currencyOrAssetCode: "SAIN-USD",
      status: "draft",
      authorizationState: "not_configured",
      effectiveAt: null,
      recordedAt: null,
      recordedBy: null,
      description: "Sandbox asset design record only. This is not issuance and does not create a live asset.",
      metadata: {
        operationalState: "design stage",
        demoRecord: true,
      },
      reversalOf: null,
      sandbox: true,
    },
    {
      ledgerEventId: "LE-TREASURY-PENDING-001",
      eventType: "Treasury authorization model",
      eventCategory: "treasury",
      sourceWorkspace: "Treasury",
      sourceRecordId: "TREASURY-AUTHORITY-MODEL",
      employerId: null,
      employeeId: null,
      assetProgramId: null,
      treasuryRecordId: "TREASURY-AUTHORITY-MODEL",
      debitAccountId: null,
      creditAccountId: null,
      amount: null,
      currencyOrAssetCode: "USD",
      status: "awaiting_authorization",
      authorizationState: "not_configured",
      effectiveAt: null,
      recordedAt: null,
      recordedBy: null,
      description: "Sandbox treasury authorization model only. It is not proof of reserve funds.",
      metadata: {
        operationalState: "not configured",
        demoRecord: true,
      },
      reversalOf: null,
      sandbox: true,
    },
  ];

  return [...payrollEvents, ...operationalExamples];
}

function matchesLedgerFilters(event: LedgerEvent, filters: LedgerFilters) {
  return (
    (filters.workspace === "All" || event.sourceWorkspace === filters.workspace) &&
    (filters.category === "All" || event.eventCategory === filters.category) &&
    (filters.status === "All" || event.status === filters.status) &&
    (!filters.employer || event.employerId?.toLowerCase().includes(filters.employer.toLowerCase())) &&
    (!filters.employee || event.employeeId?.toLowerCase().includes(filters.employee.toLowerCase())) &&
    (!filters.asset || event.assetProgramId?.toLowerCase().includes(filters.asset.toLowerCase()) || event.currencyOrAssetCode?.toLowerCase().includes(filters.asset.toLowerCase())) &&
    (!filters.date || event.recordedAt?.includes(filters.date) || event.effectiveAt?.includes(filters.date)) &&
    (!filters.ledgerEventId || event.ledgerEventId.toLowerCase().includes(filters.ledgerEventId.toLowerCase()))
  );
}

function Card({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div id={id} className={`border border-white/10 bg-white/[0.025] ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  copy,
}: {
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300">
        {eyebrow}
      </p>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 text-base leading-7 text-slate-400">{copy}</p>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Card className="p-5">
      <Icon className="h-6 w-6 text-emerald-300" aria-hidden />
      <p className="mt-6 text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{note}</p>
    </Card>
  );
}

function StatusPill({ state }: { state: EventState }) {
  return (
    <span className={`inline-flex border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${stateTone(state)}`}>
      {state}
    </span>
  );
}

function workspaceMetrics({
  activeWorkspace,
  events,
  totals,
}: {
  activeWorkspace: EmploymentRouteId;
  events: SandboxEvent[];
  totals: Record<EventState, number>;
}) {
  const admitted = events.filter((event) => event.state === "accepted");

  switch (activeWorkspace) {
    case "employer":
      return [
        { icon: Building2, label: "Company profile", value: "Greenwood", note: "Sandbox employer entity" },
        { icon: UsersRound, label: "Employees", value: "48", note: "4 shown in prototype" },
        { icon: Clock3, label: "Pending disbursements", value: String(totals.pending), note: "No live payout initiated" },
        { icon: MessageSquareWarning, label: "Correction requests", value: String(totals.held), note: "Mock manual review" },
      ];
    case "employee":
      return [
        { icon: UserRound, label: "Current standing", value: "Active", note: "Employee status mock" },
        { icon: LineChart, label: "Expected pay", value: "$2,840", note: "Projection only" },
        { icon: FileText, label: "Pay events", value: String(events.length), note: "Sandbox records" },
        { icon: Landmark, label: "Pay account", value: "Ready mock", note: "No live account exists" },
      ];
    case "intake":
      return [
        { icon: BadgeCheck, label: "Accepted", value: String(totals.accepted), note: "Admitted claims" },
        { icon: Clock3, label: "Pending", value: String(totals.pending), note: "Awaiting kernel outcome" },
        { icon: AlertTriangle, label: "Held", value: String(totals.held), note: "Needs review" },
        { icon: XCircle, label: "Rejected", value: String(totals.rejected), note: "No ledger entry" },
      ];
    case "kernel":
      return [
        { icon: FileText, label: "Active claim", value: events[0]?.id ?? "None", note: "Current simulator input" },
        { icon: Workflow, label: "Pipeline stages", value: "7", note: "Claim through response" },
        { icon: Fingerprint, label: "Idempotency", value: "Mock", note: "Replay-safe surface" },
        { icon: ShieldCheck, label: "Output state", value: events[0]?.state ?? "pending", note: "Sandbox decision" },
      ];
    case "ledger":
      return [
        { icon: Database, label: "Admitted events", value: String(admitted.length), note: "Rejected claims excluded" },
        { icon: FileCheck2, label: "Ledger lines", value: String(admitted.length * 2), note: "Debit and credit display" },
        { icon: LineChart, label: "Projection", value: "$2,840", note: "Available balance mock" },
        { icon: LockKeyhole, label: "Append-only", value: "On", note: "Sandbox event log" },
      ];
    case "assets":
      return [
        { icon: PackageCheck, label: "Asset programs", value: "2", note: "Sandbox asset models" },
        { icon: Database, label: "Internal wallets", value: "6", note: "No external custody connected" },
        { icon: Clock3, label: "Pending transfers", value: "0", note: "No live settlement initiated" },
        { icon: LockKeyhole, label: "Escrow positions", value: "0", note: "Sandbox agreements only" },
      ];
    case "treasury":
      return [
        { icon: CircleDollarSign, label: "Simulated reserves", value: "$0.00", note: "No reserve account connected" },
        { icon: PackageCheck, label: "Outstanding SAIN USD", value: "0", note: "No live assets issued" },
        { icon: ShieldCheck, label: "Pending authorizations", value: "0", note: "Multistep approval model" },
        { icon: Database, label: "Reconciliation status", value: "Not started", note: "Sandbox ledger only" },
      ];
    case "admin":
      return [
        { icon: ClipboardList, label: "Claims queue", value: String(events.length), note: "All sandbox claims" },
        { icon: AlertTriangle, label: "Held events", value: String(totals.held), note: "Manual review mock" },
        { icon: ShieldAlert, label: "Risk flags", value: "3", note: "Local mock rules" },
        { icon: FileCheck2, label: "Audit trail", value: "Active", note: "Admin history mock" },
      ];
    case "partner":
      return [
        { icon: CheckCircle2, label: "Built now", value: String(partnerBuiltNow.length), note: "Bank-independent layers" },
        { icon: Landmark, label: "Requires partner", value: String(partnerRequired.length), note: "Regulated functions" },
        { icon: Workflow, label: "Contracts", value: "Mock", note: "Data handoff preview" },
        { icon: LockKeyhole, label: "Boundary", value: "Clear", note: "No live banking claims" },
      ];
    case "career":
      return [
        { icon: Sparkles, label: "Readiness score", value: "82", note: "Mock worker profile" },
        { icon: BriefcaseBusiness, label: "Current role", value: "Lead", note: "Greenwood Logistics" },
        { icon: Award, label: "Skills", value: "6", note: "Verified and pending" },
        { icon: Clock3, label: "First paycheck", value: "Mapped", note: "Onboarding journey mock" },
      ];
    default:
      return [];
  }
}

function EmployerWorkspace({ events }: { events: SandboxEvent[] }) {
  const pending = events.filter((event) => event.state === "pending").length;
  const held = events.filter((event) => event.state === "held").length;
  const accepted = events.filter((event) => event.state === "accepted").length;
  const pendingDisbursements = events.filter((event) => event.state === "pending");
  const correctionRequests = events.filter((event) => event.type === "Payroll correction" || event.state === "held");

  return (
    <section id="employer-workspace" className="py-16">
      <SectionTitle
        eyebrow="Layer 01"
        title="Employer Operations"
        copy="A sandbox operating surface for company profile, employees, payroll activity, funding instructions, pending disbursements, correction requests, settlement activity, and employer financial history."
      />
      <div className="mt-8 grid gap-4 lg:grid-cols-4">
        <MetricCard icon={Building2} label="Company profile" value="Greenwood Logistics" note="Sandbox employer entity" />
        <MetricCard icon={UsersRound} label="Employees" value="48" note="4 shown in prototype" />
        <MetricCard icon={Clock3} label="Pending disbursements" value={String(pending)} note="No live payout initiated" />
        <MetricCard icon={MessageSquareWarning} label="Correction requests" value={String(held)} note="Mock manual review" />
      </div>

      <div className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
              Employer Operations
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Financial operations workspace
            </h3>
          </div>
          <span className="border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
            Sandbox only
          </span>
        </div>
        <nav className="mt-5 flex max-w-full gap-2 overflow-x-auto pb-1" aria-label="Employer operations sections">
          {employerOperationSections.map((section) => (
            <a
              key={section}
              href={`#employer-${section.toLowerCase()}`}
              className="whitespace-nowrap border border-white/10 bg-white/[0.025] px-3 py-2 text-sm font-semibold text-slate-400 outline-none transition hover:border-emerald-300/35 hover:text-emerald-200 focus-visible:border-emerald-200 focus-visible:text-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-300/30"
            >
              {section}
            </a>
          ))}
        </nav>
      </div>

      <div id="employer-overview" className="mt-6 grid gap-4 lg:grid-cols-4">
        <MetricCard icon={Building2} label="Employer ID" value="EMP-GREENWOOD" note="Sandbox employer record" />
        <MetricCard icon={Database} label="Payroll records" value={String(events.length)} note="Local sandbox events" />
        <MetricCard icon={FileCheck2} label="Prepared payroll" value={String(accepted)} note="Accepted sandbox events" />
        <MetricCard icon={Landmark} label="Funding status" value="Not connected" note="No live funding source" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <Card id="employer-employees" className="overflow-hidden">
          <div className="border-b border-white/10 p-5">
            <h3 className="font-semibold text-white">Employees list</h3>
          </div>
          <div className="divide-y divide-white/10">
            {employees.map((employee) => (
              <div key={employee.name} className="grid gap-3 p-5 sm:grid-cols-[1fr_160px_140px] sm:items-center">
                <div>
                  <p className="font-semibold text-white">{employee.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{employee.role}</p>
                </div>
                <p className="text-sm text-slate-300">{employee.expected}</p>
                <p className="text-sm text-emerald-200">{employee.status}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card id="employer-payroll" className="p-5">
          <h3 className="font-semibold text-white">Payroll activity</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Payroll records remain sandbox-only claim events until later Kernel and Ledger integration.
          </p>
          <div className="mt-5 grid gap-3">
            {events.map((event) => (
              <div key={event.id} className="border border-white/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm text-emerald-200">{event.id}</p>
                    <p className="mt-2 text-sm font-semibold text-white">{event.type}</p>
                    <p className="mt-1 text-xs text-slate-500">{event.employee}</p>
                  </div>
                  <StatusPill state={event.state} />
                </div>
                <p className="mt-3 text-sm text-slate-400">{event.note}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card id="employer-funding" className="p-6">
          <h3 className="text-xl font-semibold text-white">Funding</h3>
          <div className="mt-5 grid gap-3 text-sm text-slate-300">
            <div className="flex justify-between border-b border-white/10 pb-3"><span>Funding status</span><span className="text-amber-100">Not connected</span></div>
            <div className="flex justify-between border-b border-white/10 pb-3"><span>Funding sources</span><span>No funding sources configured</span></div>
            <div className="flex justify-between border-b border-white/10 pb-3"><span>Available sandbox balance</span><span className="font-mono text-emerald-200">$0.00</span></div>
            <div className="flex justify-between"><span>Pending funding instructions</span><span>0</span></div>
          </div>
          <p className="mt-5 border-l border-emerald-300/40 pl-4 text-sm leading-6 text-slate-400">
            Funding records shown here are simulated. No bank account, payment processor, custodian, or live funding source is connected.
          </p>
        </Card>

        <Card id="employer-disbursements" className="p-6">
          <h3 className="text-xl font-semibold text-white">Disbursements</h3>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Pending disbursements are modeled from sandbox pay events. No payout is initiated.
          </p>
          <div className="mt-5 grid gap-3">
            {pendingDisbursements.length > 0 ? (
              pendingDisbursements.map((event) => (
                <div key={event.id} className="flex items-center justify-between gap-4 border border-white/10 p-4">
                  <div>
                    <p className="font-semibold text-white">{event.id}</p>
                    <p className="mt-1 text-sm text-slate-500">{event.employee} - {event.type}</p>
                  </div>
                  <StatusPill state={event.state} />
                </div>
              ))
            ) : (
              <div className="border border-white/10 p-4 text-sm text-slate-400">
                No pending disbursements recorded.
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[.95fr_1.05fr]">
        <Card id="employer-settlement" className="p-6">
          <h3 className="text-xl font-semibold text-white">Settlement</h3>
          <div className="mt-5 grid gap-3 text-sm text-slate-300">
            <div className="flex justify-between border-b border-white/10 pb-3"><span>Settlement method</span><span className="text-amber-100">Not configured</span></div>
            <div className="flex justify-between border-b border-white/10 pb-3"><span>Preferred settlement asset</span><span>None selected</span></div>
            <div className="flex justify-between border-b border-white/10 pb-3"><span>Pending settlement instructions</span><span>0</span></div>
            <div className="flex justify-between"><span>Completed settlements</span><span>0</span></div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {["Conventional payment settlement", "SAIN digital settlement"].map((choice) => (
              <button
                key={choice}
                type="button"
                disabled
                className="h-12 cursor-not-allowed border border-white/10 bg-white/[0.025] px-4 text-sm font-semibold text-slate-500"
              >
                {choice}
              </button>
            ))}
          </div>
          <p className="mt-5 border-l border-emerald-300/40 pl-4 text-sm leading-6 text-slate-400">
            SAIN digital settlement is a planned internal settlement option. It is currently a sandbox model and does not issue, transfer, or redeem a live digital asset.
          </p>
        </Card>

        <Card id="employer-corrections" className="p-6">
          <h3 className="text-xl font-semibold text-white">Corrections</h3>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Correction requests preserve the existing payroll review workflow and do not move money.
          </p>
          <div className="mt-5 grid gap-3">
            {correctionRequests.length > 0 ? (
              correctionRequests.map((event) => (
                <div key={event.id} className="border border-amber-300/20 bg-amber-400/[0.05] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-white">{event.id} - {event.type}</p>
                    <StatusPill state={event.state} />
                  </div>
                  <p className="mt-2 text-sm text-slate-400">{event.note}</p>
                </div>
              ))
            ) : (
              <div className="border border-white/10 p-4 text-sm text-slate-400">
                No correction requests recorded.
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card id="employer-activity" className="mt-4 p-6">
          <h3 className="font-semibold text-white">Employer activity history</h3>
          <div className="mt-5 grid gap-6 lg:grid-cols-[.75fr_1.25fr]">
            <div className="grid gap-4">
              {activity.map((item) => (
                <div key={item} className="border-l border-emerald-300/40 pl-4 text-sm leading-6 text-slate-300">
                  {item}
                </div>
              ))}
            </div>
            <div className="border border-white/10 bg-black/30 p-5">
              <h4 className="font-semibold text-white">Structured employer activity event log</h4>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Activity events are typed for future Ledger and Kernel integration and will support event ID, employer ID, event type, timestamp, actor, related record ID, status, source workspace, Ledger reference, and description.
              </p>
              {employerActivityEvents.length > 0 ? (
                <div className="mt-5 grid gap-3">
                  {employerActivityEvents.map((event) => (
                    <div key={event.eventId} className="border border-white/10 p-4">
                      <p className="font-mono text-xs text-emerald-300">{event.eventId}</p>
                      <p className="mt-2 text-sm font-semibold text-white">{event.description}</p>
                      <p className="mt-1 text-xs text-slate-500">Ledger reference: {event.ledgerReference ?? "None"}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5 border border-white/10 p-4 text-sm text-slate-400">
                  No structured employer activity events recorded yet.
                </div>
              )}
            </div>
          </div>
        </Card>
    </section>
  );
}

function EmployeeWorkspace({ latestEvent }: { latestEvent: SandboxEvent }) {
  return (
    <section id="employee-workspace" className="border-t border-white/10 py-16">
      <SectionTitle
        eyebrow="Layer 02"
        title="Employee Workspace"
        copy="A worker-facing view of expected pay, pending pay events, profile state, support entry points, and activity history before any live banking rails exist."
      />
      <div className="mt-8 grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-slate-400">Employee dashboard</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">Maya Ellis</h3>
              <p className="mt-2 text-sm text-slate-500">Operations Lead · Greenwood Logistics</p>
            </div>
            <UserRound className="h-8 w-8 text-emerald-300" aria-hidden />
          </div>
          <div className="mt-8 grid gap-3">
            {payTimeline.map((item) => (
              <div key={item.label} className="grid grid-cols-[1fr_auto] gap-4 border border-white/10 p-4">
                <div>
                  <p className="text-sm font-semibold text-white">{item.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.status}</p>
                </div>
                <p className="font-mono text-sm text-emerald-200">{item.value}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <h3 className="font-semibold text-white">Pending pay event</h3>
          <div className="mt-5 border border-emerald-400/20 bg-emerald-400/[0.06] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-white">{latestEvent.type}</p>
                <p className="mt-1 text-sm text-slate-400">{latestEvent.note}</p>
              </div>
              <StatusPill state={latestEvent.state} />
            </div>
            <p className="mt-6 font-mono text-3xl font-semibold text-emerald-200">
              {currency(latestEvent.amount)}
            </p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button className="h-11 border border-white/15 text-sm font-semibold text-white transition hover:border-emerald-300/60 hover:text-emerald-200">
              View activity history
            </button>
            <button className="h-11 border border-amber-300/25 text-sm font-semibold text-amber-100 transition hover:border-amber-200">
              Open support/dispute
            </button>
          </div>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[.85fr_1.15fr]">
        <Card className="p-6">
          <h3 className="font-semibold text-white">Current standing and pay-account readiness</h3>
          <div className="mt-5 grid gap-3 text-sm text-slate-300">
            <div className="flex justify-between border-b border-white/10 pb-3"><span>Employment standing</span><span className="text-emerald-200">Active</span></div>
            <div className="flex justify-between border-b border-white/10 pb-3"><span>Pay-account readiness</span><span className="text-amber-100">Sandbox review</span></div>
            <div className="flex justify-between border-b border-white/10 pb-3"><span>Direct deposit mock</span><span>Not live</span></div>
            <div className="flex justify-between"><span>Support/dispute channel</span><span className="text-emerald-200">Available</span></div>
          </div>
        </Card>
        <Card className="p-6">
          <h3 className="font-semibold text-white">Employee-facing activity history</h3>
          <div className="mt-5 grid gap-4">
            {employeeActivity.map((item) => (
              <div key={item} className="border-l border-emerald-300/40 pl-4 text-sm leading-6 text-slate-300">
                {item}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}

function PayEventIntake({
  onCreate,
  events,
}: {
  onCreate: (event: SandboxEvent) => void;
  events: SandboxEvent[];
}) {
  const [employee, setEmployee] = useState(employees[0].name);
  const [type, setType] = useState<EventType>("Off-cycle pay");
  const [amount, setAmount] = useState("420");
  const [state, setState] = useState<EventState>("accepted");
  const [note, setNote] = useState("Sandbox pay event created by employer workspace");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate({
      id: `SP-${Math.floor(1100 + Math.random() * 8000)}`,
      employee,
      type,
      amount: Number(amount) || 0,
      state,
      note,
      timestamp: new Date().toLocaleString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
  }

  return (
    <section id="pay-event-intake" className="border-t border-white/10 py-16">
      <SectionTitle
        eyebrow="Layer 03"
        title="Pay Event Intake"
        copy="Employers can create sandbox-only pay events. This models operational workflow before payroll rails, accounts, custody, or real money movement."
      />
      <Card className="mt-8 p-6">
        <form onSubmit={submit} className="grid gap-4 lg:grid-cols-5">
          <label className="grid gap-2 text-sm text-slate-300">
            Employee
            <select value={employee} onChange={(event) => setEmployee(event.target.value)} className="h-12 border border-white/[0.12] bg-[#080b0a] px-3 text-white outline-none focus:border-emerald-300/70">
              {employees.map((item) => (
                <option key={item.name}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            Event Type
            <select value={type} onChange={(event) => setType(event.target.value as EventType)} className="h-12 border border-white/[0.12] bg-[#080b0a] px-3 text-white outline-none focus:border-emerald-300/70">
              {eventTypes.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            Amount
            <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className="h-12 border border-white/[0.12] bg-white/[0.035] px-3 text-white outline-none focus:border-emerald-300/70" />
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            Sandbox State
            <select value={state} onChange={(event) => setState(event.target.value as EventState)} className="h-12 border border-white/[0.12] bg-[#080b0a] px-3 text-white outline-none focus:border-emerald-300/70">
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="pending">Pending</option>
              <option value="held">Held</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm text-slate-300 lg:col-span-4">
            Note
            <input value={note} onChange={(event) => setNote(event.target.value)} className="h-12 border border-white/[0.12] bg-white/[0.035] px-3 text-white outline-none focus:border-emerald-300/70" />
          </label>
          <button className="mt-7 h-12 rounded-full bg-emerald-400 px-5 text-sm font-semibold text-black transition hover:bg-emerald-300">
            Create sandbox event
          </button>
        </form>
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-white/10 p-5">
            <h3 className="font-semibold text-white">Claim submission and intake queue</h3>
            <p className="mt-2 text-sm text-slate-500">Accepted, pending, held, and rejected sandbox records are visible before ledger admission.</p>
          </div>
          <div className="divide-y divide-white/10">
            {events.map((event) => (
              <div key={event.id} className="grid gap-3 p-5 md:grid-cols-[100px_1fr_130px_120px] md:items-center">
                <p className="font-mono text-sm text-slate-300">{event.id}</p>
                <div>
                  <p className="font-semibold text-white">{event.type}</p>
                  <p className="mt-1 text-sm text-slate-500">{event.employee} - {event.note}</p>
                </div>
                <p className="font-mono text-sm text-emerald-200">{currency(event.amount)}</p>
                <StatusPill state={event.state} />
              </div>
            ))}
          </div>
        </Card>
        <div className="grid gap-4">
          <Card className="p-5">
            <h3 className="font-semibold text-white">Validation and admission preview</h3>
            <div className="mt-5 grid gap-3">
              {["Employee identity matched", "Employer claim authority present", "Amount within sandbox policy", "Admission depends on selected state"].map((item) => (
                <div key={item} className="flex items-center gap-3 border border-white/10 p-3 text-sm text-slate-300">
                  <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden />
                  {item}
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="font-semibold text-white">Evidence and provenance mock</h3>
            <div className="mt-5 grid gap-3 text-sm">
              {intakeEvidenceFields.map((field) => (
                <div key={field.label} className="flex justify-between gap-4 border-b border-white/10 pb-3 last:border-b-0 last:pb-0">
                  <span className="text-slate-500">{field.label}</span>
                  <span className="text-right text-slate-200">{field.value}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}

function stepState(event: SandboxEvent, index: number) {
  if (event.state === "accepted") return "accepted";
  if (event.state === "rejected") return index <= 1 ? (index === 1 ? "rejected" : "accepted") : "idle";
  if (event.state === "held") return index <= 2 ? (index === 2 ? "held" : "accepted") : "idle";
  return index <= 3 ? (index === 3 ? "pending" : "accepted") : "idle";
}

function KernelSimulator({ event }: { event: SandboxEvent }) {
  return (
    <section id="kernel-simulator" className="border-t border-white/10 py-16">
      <SectionTitle
        eyebrow="Layer 04"
        title="Financial Kernel Simulator"
        copy="Sandbox pay events move through Claim, Validation, Admission, Commit, Ledger, Projection, and Response. States model accepted, rejected, pending, and held outcomes only."
      />
      <Card className="mt-8 overflow-hidden p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-400">Active sandbox event</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              {event.id} · {event.type}
            </h3>
          </div>
          <StatusPill state={event.state} />
        </div>
        <div className="mt-8 grid gap-3 lg:grid-cols-7">
          {kernelSteps.map(({ label, icon: Icon }, index) => {
            const current = stepState(event, index);
            const tone =
              current === "accepted"
                ? "border-emerald-300/35 bg-emerald-400/[0.08] text-emerald-200"
                : current === "rejected"
                  ? "border-red-300/30 bg-red-400/[0.08] text-red-200"
                  : current === "held"
                    ? "border-amber-300/30 bg-amber-400/[0.08] text-amber-200"
                    : current === "pending"
                      ? "border-slate-300/30 bg-white/[0.06] text-slate-200"
                      : "border-white/10 bg-black/30 text-slate-500";
            return (
              <div key={label} className={`relative border p-4 ${tone}`}>
                <Icon className="h-6 w-6" aria-hidden />
                <p className="mt-5 text-sm font-semibold text-white">{label}</p>
                <p className="mt-2 text-xs uppercase tracking-wide">{current}</p>
                {index < kernelSteps.length - 1 && (
                  <ArrowRight className="absolute right-2 top-4 hidden h-4 w-4 text-emerald-300/50 lg:block" />
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-6 border-l border-emerald-300/40 pl-4 text-sm leading-6 text-slate-400">
          No real money movement. No live payroll execution. No banking rails. This simulator only models operational truth-state transitions.
        </p>
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {[
          { title: "Idempotency surface", copy: "Duplicate claim IDs resolve to one sandbox truth-state outcome." },
          { title: "Replay surface", copy: "The pipeline can be replayed from claim evidence without changing admitted output." },
          { title: "Conservation check", copy: "Admitted amounts must reconcile to matching ledger debit and credit lines." },
        ].map((item) => (
          <Card key={item.title} className="p-5">
            <Fingerprint className="h-6 w-6 text-emerald-300" aria-hidden />
            <h3 className="mt-5 font-semibold text-white">{item.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">{item.copy}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

function LedgerSandbox({ events }: { events: SandboxEvent[] }) {
  const [filters, setFilters] = useState<LedgerFilters>({
    workspace: "All",
    category: "All",
    status: "All",
    employer: "",
    employee: "",
    asset: "",
    date: "",
    ledgerEventId: "",
  });
  const admitted = events.filter((event) => event.state === "accepted");
  const ledgerEvents = canonicalLedgerEventsFromSandbox(events);
  const filteredLedgerEvents = ledgerEvents.filter((event) => matchesLedgerFilters(event, filters));
  const selectedLedgerEvent = filteredLedgerEvents[0] ?? ledgerEvents[0];
  const rows = admitted.flatMap((event) => [
    {
      id: `${event.id}-debit`,
      debit: "Employer payroll clearing",
      credit: "-",
      amount: event.amount,
      type: event.type,
      timestamp: event.timestamp,
      projection: "settled",
    },
    {
      id: `${event.id}-credit`,
      debit: "-",
      credit: `${event.employee} pay projection`,
      amount: event.amount,
      type: event.type,
      timestamp: event.timestamp,
      projection: "available",
    },
  ]);

  return (
    <section id="ledger-sandbox" className="border-t border-white/10 py-16">
      <SectionTitle
        eyebrow="Layer 05"
        title="Ledger Sandbox"
        copy="Mock double-entry records are generated for admitted sandbox pay events, with projections for settled, pending, held, and available states."
      />
      <div className="mt-8 grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
        <Card className="p-6">
          <h3 className="text-xl font-semibold text-white">Operational state vs Ledger-recorded financial state</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="border border-amber-300/20 bg-amber-400/[0.05] p-4">
              <h4 className="font-semibold text-white">Operational state</h4>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Requests, drafts, instructions, and authorizations can exist before any ledger effect. They are reviewable but not completed financial events.
              </p>
            </div>
            <div className="border border-emerald-400/20 bg-emerald-400/[0.06] p-4">
              <h4 className="font-semibold text-white">Ledger-recorded financial state</h4>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Only recorded ledger events can show debit, credit, amount, effective time, recorded time, and financial effect.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 text-sm text-slate-300">
            {[
              "A submitted issuance request is not an issued asset.",
              "A payroll draft is not a completed disbursement.",
              "A settlement instruction is not a completed settlement.",
              "A redemption request is not a completed redemption.",
              "A treasury authorization is not proof of reserve funds.",
            ].map((item) => (
              <div key={item} className="border-l border-emerald-300/40 pl-4">
                {item}
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <h3 className="text-xl font-semibold text-white">Canonical Ledger event model</h3>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Employer, Employee, Assets, Treasury, Admin, and Partner events share the same sandbox ledger event structure. Fields that do not apply remain null.
          </p>
          <div className="mt-5 grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
            {["ledgerEventId", "eventType", "eventCategory", "sourceWorkspace", "sourceRecordId", "employerId", "employeeId", "assetProgramId", "treasuryRecordId", "debitAccountId", "creditAccountId", "amount", "currencyOrAssetCode", "status", "authorizationState", "effectiveAt", "recordedAt", "recordedBy", "description", "metadata", "reversalOf", "sandbox"].map((field) => (
              <div key={field} className="border border-white/10 bg-black/30 p-2 font-mono">
                {field}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-4 p-6">
        <h3 className="text-xl font-semibold text-white">Ledger filters</h3>
        <div className="mt-5 grid gap-4 lg:grid-cols-4">
          <label className="grid gap-2 text-sm text-slate-300">
            Workspace
            <select value={filters.workspace} onChange={(event) => setFilters((current) => ({ ...current, workspace: event.target.value as LedgerFilters["workspace"] }))} className="h-11 border border-white/[0.12] bg-[#080b0a] px-3 text-white outline-none focus:border-emerald-300/70">
              {["All", "Employer", "Employee", "Assets", "Treasury", "Admin", "Partner"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            Category
            <select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value as LedgerFilters["category"] }))} className="h-11 border border-white/[0.12] bg-[#080b0a] px-3 text-white outline-none focus:border-emerald-300/70">
              {["All", "payroll", "funding", "disbursement", "correction", "settlement", "escrow", "issuance", "redemption", "treasury", "reconciliation", "reversal"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            Status
            <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as LedgerFilters["status"] }))} className="h-11 border border-white/[0.12] bg-[#080b0a] px-3 text-white outline-none focus:border-emerald-300/70">
              {["All", "draft", "pending", "awaiting_authorization", "authorized", "rejected", "recorded", "failed", "reversed", "cancelled"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            Ledger event ID
            <input value={filters.ledgerEventId} onChange={(event) => setFilters((current) => ({ ...current, ledgerEventId: event.target.value }))} className="h-11 border border-white/[0.12] bg-white/[0.035] px-3 text-white outline-none focus:border-emerald-300/70" placeholder="LE-SP-1029" />
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            Employer
            <input value={filters.employer} onChange={(event) => setFilters((current) => ({ ...current, employer: event.target.value }))} className="h-11 border border-white/[0.12] bg-white/[0.035] px-3 text-white outline-none focus:border-emerald-300/70" placeholder="EMP-GREENWOOD" />
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            Employee
            <input value={filters.employee} onChange={(event) => setFilters((current) => ({ ...current, employee: event.target.value }))} className="h-11 border border-white/[0.12] bg-white/[0.035] px-3 text-white outline-none focus:border-emerald-300/70" placeholder="EMPLOYEE-MAYA" />
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            Asset
            <input value={filters.asset} onChange={(event) => setFilters((current) => ({ ...current, asset: event.target.value }))} className="h-11 border border-white/[0.12] bg-white/[0.035] px-3 text-white outline-none focus:border-emerald-300/70" placeholder="SAIN-USD" />
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            Date
            <input value={filters.date} onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))} className="h-11 border border-white/[0.12] bg-white/[0.035] px-3 text-white outline-none focus:border-emerald-300/70" placeholder="2026-06-25" />
          </label>
        </div>
      </Card>

      <Card className="mt-4 overflow-x-auto">
        <div className="border-b border-white/10 p-5">
          <h3 className="font-semibold text-white">Canonical Ledger events</h3>
          <p className="mt-2 text-sm text-slate-500">Sandbox demonstration records only. Operational requests are visible here but are not completed financial events unless status is recorded.</p>
        </div>
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-4">Ledger Event ID</th>
              <th className="px-5 py-4">Workspace</th>
              <th className="px-5 py-4">Category</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4">Source Record</th>
              <th className="px-5 py-4">Amount</th>
              <th className="px-5 py-4">Recorded At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {filteredLedgerEvents.map((event) => (
              <tr key={event.ledgerEventId} className="text-slate-300">
                <td className="px-5 py-4 font-mono text-emerald-200">{event.ledgerEventId}</td>
                <td className="px-5 py-4">{event.sourceWorkspace}</td>
                <td className="px-5 py-4">{event.eventCategory}</td>
                <td className="px-5 py-4"><LedgerStatusPill status={event.status} /></td>
                <td className="px-5 py-4 font-mono text-slate-400">{event.sourceRecordId}</td>
                <td className="px-5 py-4 font-mono">{event.amount === null ? "-" : `${currency(event.amount)} ${event.currencyOrAssetCode ?? ""}`}</td>
                <td className="px-5 py-4 text-slate-500">{event.recordedAt ?? "Not recorded"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredLedgerEvents.length === 0 && (
          <div className="p-5 text-sm text-slate-400">
            No canonical ledger events match the current filters.
          </div>
        )}
      </Card>

      <Card className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-4">Debit</th>
              <th className="px-5 py-4">Credit</th>
              <th className="px-5 py-4">Amount</th>
              <th className="px-5 py-4">Event Type</th>
              <th className="px-5 py-4">Timestamp</th>
              <th className="px-5 py-4">Projection</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((row) => (
              <tr key={row.id} className="text-slate-300">
                <td className="px-5 py-4">{row.debit}</td>
                <td className="px-5 py-4">{row.credit}</td>
                <td className="px-5 py-4 font-mono text-emerald-200">{currency(row.amount)}</td>
                <td className="px-5 py-4">{row.type}</td>
                <td className="px-5 py-4 text-slate-500">{row.timestamp}</td>
                <td className="px-5 py-4">{row.projection}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="p-6">
          <h3 className="font-semibold text-white">Append-only event log</h3>
          <div className="mt-5 grid gap-3">
            {events.map((event) => (
              <div key={event.id} className="grid gap-2 border border-white/10 p-4 sm:grid-cols-[100px_1fr_110px] sm:items-center">
                <p className="font-mono text-sm text-slate-300">{event.id}</p>
                <p className="text-sm text-slate-400">{event.state === "accepted" ? "Admitted to ledger" : "Claim retained outside ledger"}</p>
                <StatusPill state={event.state} />
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs uppercase tracking-wide text-slate-500">
            Rejected claims are visible for audit, but do not create ledger rows.
          </p>
        </Card>
        <Card className="p-6">
          <h3 className="font-semibold text-white">Balance projections</h3>
          <div className="mt-5 grid gap-3 text-sm text-slate-300">
            <div className="flex justify-between border-b border-white/10 pb-3"><span>Settled</span><span>$450.00</span></div>
            <div className="flex justify-between border-b border-white/10 pb-3"><span>Pending</span><span>$300.00</span></div>
            <div className="flex justify-between border-b border-white/10 pb-3"><span>Held</span><span>$185.50</span></div>
            <div className="flex justify-between"><span>Available projection</span><span className="text-emerald-200">$2,840.00</span></div>
          </div>
        </Card>
      </div>
      {selectedLedgerEvent && (
        <Card className="mt-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Ledger detail view</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">{selectedLedgerEvent.ledgerEventId}</h3>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{selectedLedgerEvent.description}</p>
            </div>
            <LedgerStatusPill status={selectedLedgerEvent.status} />
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="border border-white/10 bg-black/30 p-4">
              <h4 className="font-semibold text-white">Event identity</h4>
              <div className="mt-4 grid gap-2 text-sm text-slate-300">
                <p><span className="text-slate-500">Type:</span> {selectedLedgerEvent.eventType}</p>
                <p><span className="text-slate-500">Category:</span> {selectedLedgerEvent.eventCategory}</p>
                <p><span className="text-slate-500">Sandbox:</span> {selectedLedgerEvent.sandbox ? "Yes" : "No"}</p>
              </div>
            </div>
            <div className="border border-white/10 bg-black/30 p-4">
              <h4 className="font-semibold text-white">Source and related records</h4>
              <div className="mt-4 grid gap-2 text-sm text-slate-300">
                <p><span className="text-slate-500">Workspace:</span> {selectedLedgerEvent.sourceWorkspace}</p>
                <p><span className="text-slate-500">Source:</span> {selectedLedgerEvent.sourceRecordId}</p>
                <p><span className="text-slate-500">Employer:</span> {selectedLedgerEvent.employerId ?? "-"}</p>
                <p><span className="text-slate-500">Employee:</span> {selectedLedgerEvent.employeeId ?? "-"}</p>
                <p><span className="text-slate-500">Asset:</span> {selectedLedgerEvent.assetProgramId ?? "-"}</p>
                <p><span className="text-slate-500">Treasury:</span> {selectedLedgerEvent.treasuryRecordId ?? "-"}</p>
              </div>
            </div>
            <div className="border border-white/10 bg-black/30 p-4">
              <h4 className="font-semibold text-white">Status and authorization</h4>
              <div className="mt-4 grid gap-2 text-sm text-slate-300">
                <p><span className="text-slate-500">Status:</span> {selectedLedgerEvent.status}</p>
                <p><span className="text-slate-500">Authorization:</span> {selectedLedgerEvent.authorizationState}</p>
                <p><span className="text-slate-500">Recorded by:</span> {selectedLedgerEvent.recordedBy ?? "-"}</p>
              </div>
            </div>
            <div className="border border-white/10 bg-black/30 p-4">
              <h4 className="font-semibold text-white">Financial effect</h4>
              <div className="mt-4 grid gap-2 text-sm text-slate-300">
                <p><span className="text-slate-500">Debit:</span> {selectedLedgerEvent.debitAccountId ?? "No ledger debit"}</p>
                <p><span className="text-slate-500">Credit:</span> {selectedLedgerEvent.creditAccountId ?? "No ledger credit"}</p>
                <p><span className="text-slate-500">Amount:</span> {selectedLedgerEvent.amount === null ? "No financial amount" : currency(selectedLedgerEvent.amount)}</p>
                <p><span className="text-slate-500">Currency/asset:</span> {selectedLedgerEvent.currencyOrAssetCode ?? "-"}</p>
              </div>
            </div>
            <div className="border border-white/10 bg-black/30 p-4">
              <h4 className="font-semibold text-white">Timestamps and reversal</h4>
              <div className="mt-4 grid gap-2 text-sm text-slate-300">
                <p><span className="text-slate-500">Effective:</span> {selectedLedgerEvent.effectiveAt ?? "Not effective"}</p>
                <p><span className="text-slate-500">Recorded:</span> {selectedLedgerEvent.recordedAt ?? "Not recorded"}</p>
                <p><span className="text-slate-500">Reversal of:</span> {selectedLedgerEvent.reversalOf ?? "None"}</p>
              </div>
            </div>
            <div className="border border-white/10 bg-black/30 p-4">
              <h4 className="font-semibold text-white">Metadata</h4>
              <div className="mt-4 grid gap-2 text-sm text-slate-300">
                {Object.entries(selectedLedgerEvent.metadata).map(([key, value]) => (
                  <p key={key}><span className="text-slate-500">{key}:</span> {String(value)}</p>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}
    </section>
  );
}

function AssetsWorkspace() {
  return (
    <section id="assets-workspace" className="border-t border-white/10 py-16">
      <SectionTitle
        eyebrow="Digital asset operating workspace"
        title="Assets and settlement"
        copy="Digital asset records, internal wallets, settlement instructions, escrow positions, and asset activity for the SAIN Finance sandbox."
      />

      <div className="mt-8 grid gap-3 border border-emerald-400/20 bg-emerald-400/[0.06] p-5 text-sm leading-6 text-slate-300 lg:grid-cols-[auto_1fr]">
        <LockKeyhole className="h-5 w-5 text-emerald-300" aria-hidden />
        <p>
          Sandbox only. Digital asset balances, wallets, transfers, escrow positions, minting, redemption, and settlement activity shown here are simulations. SAIN Finance is not currently issuing, holding, transferring, or redeeming live digital assets.
        </p>
      </div>

      <div className="mt-8">
        <h3 className="text-xl font-semibold text-white">Asset programs</h3>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {assetPrograms.map((program) => (
            <Card key={program.name} className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <PackageCheck className="h-6 w-6 text-emerald-300" aria-hidden />
                  <h4 className="mt-5 text-2xl font-semibold text-white">{program.name}</h4>
                  <p className="mt-2 text-sm text-slate-500">{program.type}</p>
                </div>
                <span className="border border-amber-300/25 bg-amber-400/[0.05] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-100">
                  {program.status}
                </span>
              </div>
              <div className="mt-6 grid gap-3 text-sm text-slate-300">
                <div className="grid gap-1 border-b border-white/10 pb-3">
                  <span className="text-slate-500">Purpose</span>
                  <span>{program.purpose}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Live issuance</span>
                  <span className="font-semibold text-slate-200">{program.liveIssuance}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
        <Card className="p-6">
          <h3 className="text-xl font-semibold text-white">Internal wallets</h3>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Wallet records are internal sandbox models only. No custody provider, blockchain network, or external wallet is connected.
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {internalWallets.map((wallet) => (
              <div key={wallet.id} className="border border-white/10 bg-black/30 p-4">
                <p className="font-mono text-xs text-emerald-300">{wallet.id}</p>
                <p className="mt-3 text-sm font-semibold text-white">{wallet.label}</p>
                <p className="mt-2 text-xs text-slate-500">{wallet.authority}</p>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-300">{wallet.state}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <h3 className="text-xl font-semibold text-white">Settlement and escrow activity</h3>
          <div className="mt-6 grid gap-3">
            {["No pending transfers recorded", "No escrow positions recorded", "No minting activity recorded", "No redemption activity recorded"].map((item) => (
              <div key={item} className="border border-white/10 p-4 text-sm text-slate-300">
                {item}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}

function EmptyStateCard({
  title,
  message,
  icon: Icon,
}: {
  title: string;
  message: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="p-6">
      <Icon className="h-6 w-6 text-emerald-300" aria-hidden />
      <h3 className="mt-5 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-400">{message}</p>
    </Card>
  );
}

function TreasuryWorkspace() {
  return (
    <section id="treasury-workspace" className="border-t border-white/10 py-16">
      <SectionTitle
        eyebrow="Treasury operating workspace"
        title="Treasury and reserves"
        copy="Internal treasury controls, simulated reserve positions, issuance requests, redemption requests, wallet authority, and reconciliation activity."
      />

      <div className="mt-8 grid gap-3 border border-emerald-400/20 bg-emerald-400/[0.06] p-5 text-sm leading-6 text-slate-300 lg:grid-cols-[auto_1fr]">
        <LockKeyhole className="h-5 w-5 text-emerald-300" aria-hidden />
        <p>
          Sandbox only. This workspace models treasury, reserve, issuance, redemption, authorization, and reconciliation workflows. It is not connected to a bank account, custodian, blockchain network, reserve fund, or live financial institution.
        </p>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <EmptyStateCard icon={CircleDollarSign} title="Reserve positions" message={treasuryPositions.length === 0 ? "No reserve positions recorded" : "Reserve positions available"} />
        <EmptyStateCard icon={PackageCheck} title="Issuance requests" message={issuanceRequests.length === 0 ? "No issuance requests submitted" : "Issuance requests available"} />
        <EmptyStateCard icon={Workflow} title="Redemption requests" message={redemptionRequests.length === 0 ? "No redemption requests submitted" : "Redemption requests available"} />
        <EmptyStateCard icon={Database} title="Treasury wallets" message="No treasury wallets activated" />
        <Card className="p-6">
          <ShieldCheck className="h-6 w-6 text-emerald-300" aria-hidden />
          <h3 className="mt-5 text-lg font-semibold text-white">Authority controls</h3>
          <div className="mt-5 grid gap-3">
            {authorizationStates.map((state) => (
              <div key={state.control} className="flex justify-between gap-4 border-b border-white/10 pb-3 text-sm last:border-b-0 last:pb-0">
                <span className="text-slate-300">{state.control}</span>
                <span className="text-right text-slate-500">{state.status}</span>
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm text-slate-400">No authority policy configured</p>
        </Card>
        <EmptyStateCard icon={LineChart} title="Reconciliation activity" message="No reconciliation runs completed" />
      </div>
    </section>
  );
}

function AdminConsole({ events }: { events: SandboxEvent[] }) {
  const flags = [
    "Manual review mock: payroll correction above threshold",
    "Risk flag mock: new-hire advance policy validation",
    "Reconciliation status mock: sandbox ledger balanced",
  ];

  return (
    <section id="admin-console" className="border-t border-white/10 py-16">
      <SectionTitle
        eyebrow="Layer 06"
        title="Admin Console"
        copy="An internal operational view for claims queue, event log, account states, disputes, reconciliation status, risk flags, and manual review."
      />
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <ClipboardList className="h-6 w-6 text-emerald-300" aria-hidden />
          <h3 className="mt-5 font-semibold text-white">Claims queue</h3>
          <div className="mt-4 grid gap-3">
            {events.map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-3 border border-white/10 p-3">
                <span className="text-sm text-slate-300">{event.id}</span>
                <StatusPill state={event.state} />
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <Gauge className="h-6 w-6 text-emerald-300" aria-hidden />
          <h3 className="mt-5 font-semibold text-white">Account states</h3>
          <div className="mt-4 grid gap-3 text-sm text-slate-300">
            <div className="flex justify-between border-b border-white/10 pb-3"><span>Settled</span><span>$450.00</span></div>
            <div className="flex justify-between border-b border-white/10 pb-3"><span>Pending</span><span>$300.00</span></div>
            <div className="flex justify-between border-b border-white/10 pb-3"><span>Held</span><span>$185.50</span></div>
            <div className="flex justify-between"><span>Available projection</span><span>$2,840.00</span></div>
          </div>
        </Card>
        <Card className="p-5">
          <ShieldAlert className="h-6 w-6 text-emerald-300" aria-hidden />
          <h3 className="mt-5 font-semibold text-white">Disputes and risk</h3>
          <div className="mt-4 grid gap-3">
            {flags.map((flag) => (
              <div key={flag} className="border-l border-amber-300/40 pl-4 text-sm leading-6 text-slate-300">
                {flag}
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="p-6">
          <h3 className="font-semibold text-white">Manual review and correction workflow</h3>
          <div className="mt-5 grid gap-3">
            {events.filter((event) => event.state === "held").map((event) => (
              <div key={event.id} className="border border-amber-300/20 bg-amber-400/[0.05] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-white">{event.id} - {event.type}</p>
                  <StatusPill state={event.state} />
                </div>
                <p className="mt-2 text-sm text-slate-400">{event.note}</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {["Request evidence", "Hold projection", "Resolve correction"].map((action) => (
                    <button key={action} className="h-10 border border-white/15 text-xs font-semibold text-slate-200 transition hover:border-emerald-300/60 hover:text-emerald-200">
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <h3 className="font-semibold text-white">Restriction controls and admin audit history</h3>
          <div className="mt-5 grid gap-3">
            {["Freeze pay-account projection mock", "Restrict claim admission mock", "Escalate support case mock"].map((control) => (
              <div key={control} className="flex items-center justify-between gap-4 border border-white/10 p-4">
                <span className="text-sm text-slate-300">{control}</span>
                <span className="text-xs uppercase tracking-wide text-slate-500">Inactive</span>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-3 border-l border-emerald-300/40 pl-4 text-sm leading-6 text-slate-300">
            <p>Admin viewed held correction SP-1030</p>
            <p>Risk flag marked for manual review</p>
            <p>Sandbox reconciliation incident resolved</p>
          </div>
        </Card>
      </div>
    </section>
  );
}

function PartnerReadiness() {
  return (
    <section id="partner-readiness" className="border-t border-white/10 py-16">
      <SectionTitle
        eyebrow="Layer 07"
        title="Partner Readiness View"
        copy="A clear separation between what SAIN can prototype before bank integration and what requires a sponsor bank or regulated partner."
      />
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-300" aria-hidden />
            <h3 className="text-xl font-semibold text-white">Built now</h3>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {partnerBuiltNow.map((item) => (
              <div key={item} className="border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-sm font-semibold text-emerald-100">
                {item}
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <Landmark className="h-6 w-6 text-amber-200" aria-hidden />
            <h3 className="text-xl font-semibold text-white">Requires partner</h3>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {partnerRequired.map((item) => (
              <div key={item} className="border border-amber-300/20 bg-amber-400/[0.05] p-4 text-sm font-semibold text-amber-100">
                {item}
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-6">
          <h3 className="font-semibold text-white">Integration checklist</h3>
          <div className="mt-5 grid gap-3">
            {["Account creation strategy", "Settlement event mapping", "Returns and reversals", "Reconciliation snapshots"].map((item) => (
              <div key={item} className="flex items-center gap-3 border border-white/10 p-3 text-sm text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden />
                {item}
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <h3 className="font-semibold text-white">Partner data and contracts mock</h3>
          <div className="mt-5 grid gap-3 text-sm text-slate-300">
            <div className="flex justify-between border-b border-white/10 pb-3"><span>Program profile</span><span>Draft</span></div>
            <div className="flex justify-between border-b border-white/10 pb-3"><span>Event contract</span><span>Mock v0.1</span></div>
            <div className="flex justify-between border-b border-white/10 pb-3"><span>Data retention</span><span>Review needed</span></div>
            <div className="flex justify-between"><span>Operational ownership</span><span>Partner review</span></div>
          </div>
        </Card>
        <Card className="border-amber-300/20 bg-amber-400/[0.04] p-6">
          <Landmark className="h-6 w-6 text-amber-200" aria-hidden />
          <h3 className="mt-5 font-semibold text-white">Sandbox boundary notice</h3>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            This workspace does not represent live custody, account issuance, ACH, FedNow, card issuing, or regulated compliance operations. Those functions require selected partners.
          </p>
        </Card>
      </div>
    </section>
  );
}

function CareerOS() {
  return (
    <section id="career-os" className="border-t border-white/10 py-16">
      <SectionTitle
        eyebrow="Layer 08"
        title="Career OS"
        copy="A worker-owned career layer that can move from job to job with the employee. The employer changes. The worker keeps SAIN."
      />

      <div className="mt-8 grid gap-4 lg:grid-cols-6">
        <MetricCard icon={BriefcaseBusiness} label="Current role" value="Operations Lead" note="Greenwood Logistics" />
        <MetricCard icon={Building2} label="Current employer" value="Greenwood" note="Sandbox company profile" />
        <MetricCard icon={Sparkles} label="Career stage" value="Lead" note="Ready for supervisor path" />
        <MetricCard icon={BadgeCheck} label="Verified history" value="3" note="Employment records mock" />
        <MetricCard icon={Award} label="Skills" value="6" note="Verified and pending" />
        <MetricCard icon={Gauge} label="Readiness score" value="82" note="Mock career readiness" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <Card className="p-6">
          <h3 className="text-xl font-semibold text-white">First-paycheck user journey</h3>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {[
              { step: "01", label: "Accept role", note: "Worker begins onboarding with employer mock." },
              { step: "02", label: "Prepare pay profile", note: "Expected pay and documents are organized." },
              { step: "03", label: "Track first pay", note: "Paycheck readiness status becomes visible." },
              { step: "04", label: "Carry history forward", note: "Career record stays with the worker." },
            ].map((item) => (
              <div key={item.step} className="border border-white/10 bg-black/30 p-4">
                <p className="font-mono text-sm text-emerald-300">{item.step}</p>
                <p className="mt-4 font-semibold text-white">{item.label}</p>
                <p className="mt-3 text-sm leading-6 text-slate-400">{item.note}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <h3 className="text-xl font-semibold text-white">Employee path into SAIN Finance</h3>
          <div className="mt-5 grid gap-3 text-sm text-slate-300">
            <div className="flex justify-between border-b border-white/10 pb-3"><span>Job onboarding</span><span className="text-emerald-200">Mock ready</span></div>
            <div className="flex justify-between border-b border-white/10 pb-3"><span>Paycheck readiness</span><span>Mapped</span></div>
            <div className="flex justify-between border-b border-white/10 pb-3"><span>Career profile</span><span>Worker-owned</span></div>
            <div className="flex justify-between"><span>Live job applications</span><span className="text-amber-100">Requires partner/API</span></div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
        <Card className="p-6">
          <h3 className="text-xl font-semibold text-white">Employment Timeline</h3>
          <div className="mt-6 grid gap-4">
            {employmentHistory.map((item) => (
              <div key={`${item.employer}-${item.role}`} className="border-l border-emerald-300/40 pl-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{item.role}</p>
                    <p className="mt-1 text-sm text-slate-400">{item.employer}</p>
                  </div>
                  <span className="border border-emerald-400/25 bg-emerald-400/[0.06] px-2.5 py-1 text-xs font-semibold text-emerald-200">
                    {item.status}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-500">{item.dates}</p>
                <p className="mt-2 text-sm text-emerald-100">{item.payGrowth}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-xl font-semibold text-white">Skills Passport</h3>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Portable worker-owned skills profile. Statuses are local sandbox mocks.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {skillsPassport.map((item) => (
              <div key={item.skill} className="border border-white/10 bg-black/30 p-4">
                <Award className="h-5 w-5 text-emerald-300" aria-hidden />
                <p className="mt-4 text-sm font-semibold text-white">{item.skill}</p>
                <p className={`mt-2 text-xs font-semibold uppercase tracking-wide ${item.status === "Verified" ? "text-emerald-300" : "text-amber-200"}`}>
                  {item.status}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <ClipboardList className="h-6 w-6 text-emerald-300" aria-hidden />
            <h3 className="text-xl font-semibold text-white">Documents Vault</h3>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Sandbox mock documents only. No real worker files are stored or submitted.
          </p>
          <div className="mt-6 grid gap-3">
            {workerDocuments.map((document) => (
              <div key={document} className="flex items-center justify-between gap-3 border border-white/10 p-4">
                <span className="text-sm font-semibold text-white">{document}</span>
                <span className="text-xs uppercase tracking-wide text-slate-500">Mock</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <GraduationCap className="h-6 w-6 text-emerald-300" aria-hidden />
            <h3 className="text-xl font-semibold text-white">Career Growth</h3>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {careerPaths.map((path) => (
              <div key={path.title} className="border border-white/10 bg-black/30 p-5">
                <p className="font-semibold text-white">{path.title}</p>
                <p className="mt-3 text-sm leading-6 text-slate-400">{path.why}</p>
                <p className="mt-4 font-mono text-sm text-emerald-200">{path.pay}</p>
                <p className="mt-2 text-xs text-amber-100">Skill gap: {path.gap}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-white">Jobs Resource</h3>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Mock job matches from potential staffing and employer partners. SAIN is not acting as a staffing agency, does not submit applications, and does not guarantee jobs.
            </p>
          </div>
          <span className="border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
            Local mock data
          </span>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-4">
          {jobMatches.map((job) => (
            <div key={`${job.company}-${job.title}`} className="border border-white/10 bg-black/30 p-5">
              <p className="font-semibold text-white">{job.title}</p>
              <p className="mt-2 text-sm text-slate-400">{job.company}</p>
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                <MapPin className="h-4 w-4 text-emerald-300" aria-hidden />
                {job.location}
              </div>
              <p className="mt-4 font-mono text-sm text-emerald-200">{job.pay}</p>
              <p className="mt-2 text-sm text-slate-300">Match: {job.match}</p>
              <div className="mt-5 grid gap-2">
                <button className="inline-flex h-10 items-center justify-center gap-2 border border-white/15 text-sm font-semibold text-white transition hover:border-emerald-300/60 hover:text-emerald-200">
                  <Save className="h-4 w-4" aria-hidden />
                  Save job
                </button>
                <button className="h-10 border border-emerald-400/25 bg-emerald-400/[0.06] text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/60">
                  Prepare application
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-1">
          <h3 className="text-xl font-semibold text-white">Partner Integration Preview</h3>
          <div className="mt-6 grid gap-3">
            {futureCareerIntegrations.map((item) => (
              <div key={item} className="border-l border-emerald-300/40 pl-4 text-sm leading-6 text-slate-300">
                {item}
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6 lg:col-span-2">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-300" aria-hidden />
                <h3 className="text-lg font-semibold text-white">Built now</h3>
              </div>
              <div className="mt-5 grid gap-3">
                {careerBuiltNow.map((item) => (
                  <div key={item} className="border border-emerald-400/20 bg-emerald-400/[0.06] p-3 text-sm font-semibold text-emerald-100">
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <Landmark className="h-6 w-6 text-amber-200" aria-hidden />
                <h3 className="text-lg font-semibold text-white">Requires partner/API</h3>
              </div>
              <div className="mt-5 grid gap-3">
                {careerPartnerRequired.map((item) => (
                  <div key={item} className="border border-amber-300/20 bg-amber-400/[0.05] p-3 text-sm font-semibold text-amber-100">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}

export function EmploymentWorkspacePage({
  activeWorkspace,
}: {
  activeWorkspace: EmploymentRouteId;
}) {
  const [events, setEvents] = useState<SandboxEvent[]>(baseEvents);
  const latestEvent = events[0];
  const pageProfile = employmentPageProfiles[activeWorkspace];
  const totals = useMemo(() => {
    return {
      accepted: events.filter((event) => event.state === "accepted").length,
      pending: events.filter((event) => event.state === "pending").length,
      held: events.filter((event) => event.state === "held").length,
      rejected: events.filter((event) => event.state === "rejected").length,
    };
  }, [events]);
  const metrics = workspaceMetrics({ activeWorkspace, events, totals });

  function addEvent(event: SandboxEvent) {
    setEvents((current) => [event, ...current]);
  }

  function renderActiveWorkspace() {
    switch (activeWorkspace) {
      case "employer":
        return <EmployerWorkspace events={events} />;
      case "employee":
        return <EmployeeWorkspace latestEvent={latestEvent} />;
      case "intake":
        return <PayEventIntake onCreate={addEvent} events={events} />;
      case "kernel":
        return <KernelSimulator event={latestEvent} />;
      case "ledger":
        return <LedgerSandbox events={events} />;
      case "assets":
        return <AssetsWorkspace />;
      case "treasury":
        return <TreasuryWorkspace />;
      case "admin":
        return <AdminConsole events={events} />;
      case "partner":
        return <PartnerReadiness />;
      case "career":
        return <CareerOS />;
      default:
        return <EmployerWorkspace events={events} />;
    }
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/[0.86] backdrop-blur-xl">
        <div className="mx-auto flex min-h-20 max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center border border-emerald-400/40 bg-emerald-400/10 text-sm font-semibold text-emerald-300">
              S
            </span>
            <span className="text-sm font-semibold uppercase tracking-[0.28em] text-white">
              SAIN FINANCE
            </span>
          </Link>
          <nav className="flex w-full max-w-full gap-2 overflow-x-auto pb-1 text-sm text-slate-400 lg:w-auto" aria-label="Employment workspaces">
            {employmentTabs.map((tab) => (
              <Link
                key={tab.id}
                href={tab.href}
                aria-current={activeWorkspace === tab.id ? "page" : undefined}
                className={`whitespace-nowrap border px-3 py-2 text-sm font-semibold outline-none transition focus-visible:border-emerald-200 focus-visible:text-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-300/30 ${
                  activeWorkspace === tab.id
                    ? "border-emerald-300/50 bg-emerald-400/[0.1] text-emerald-100"
                    : "border-white/10 bg-white/[0.025] text-slate-400 hover:border-emerald-300/35 hover:text-emerald-200"
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300">
              {pageProfile.eyebrow}
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-6xl">
              {pageProfile.title}
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
              {pageProfile.copy}
            </p>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-4">
            {metrics.map((metric) => (
              <MetricCard
                key={`${activeWorkspace}-${metric.label}`}
                icon={metric.icon}
                label={metric.label}
                value={metric.value}
                note={metric.note}
              />
            ))}
          </div>

          <div className="mt-8 grid gap-3 border border-emerald-400/20 bg-emerald-400/[0.06] p-5 text-sm leading-6 text-slate-300 lg:grid-cols-[auto_1fr]">
            <LockKeyhole className="h-5 w-5 text-emerald-300" aria-hidden />
            <p>
              Sandbox only. This is not live banking, live payroll, live custody, or live digital asset settlement, and it is not moving real money. It models employer operations, operational workflows, authorization states, and financial truth states before regulated partner integration.
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
          <div className="min-w-0 border border-white/10 bg-white/[0.018]">
            <div className="border-b border-white/10 px-5 py-4 sm:px-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
                Current page
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                {pageProfile.workspaceLabel}
              </h2>
            </div>
            <div className="px-5 sm:px-6">{renderActiveWorkspace()}</div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 py-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 text-sm text-slate-500 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <p>SAIN Finance - Employment Platform Preview</p>
          <div className="flex flex-wrap gap-5">
            <Link href="/" className="transition hover:text-white">Marketing site</Link>
            <Link href="/platform/employment/intake" className="transition hover:text-white">
              Create sandbox event
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

import type { Metadata } from "next";
import { EmployerWorkspacePage } from "../_components/role-scoped-workspaces";

export const metadata: Metadata = {
  title: "SAIN - Employer Workspace",
  description:
    "Role-scoped employer dashboard for workforce, payroll, funding, disbursements, corrections, reports, and settings.",
};

export default function EmployerWorkspaceRoute() {
  return <EmployerWorkspacePage />;
}

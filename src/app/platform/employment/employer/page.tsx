import type { Metadata } from "next";
import { AuthenticatedWorkspaceGate } from "../_components/authenticated-workspace-gate";
import { NotificationCenter } from "../_components/notification-center";
import { EmployerWorkspacePage } from "../_components/role-scoped-workspaces";

export const metadata: Metadata = {
  title: "SAIN - Employer Workspace",
  description:
    "Authenticated employer dashboard for workforce, payroll, funding, disbursements, corrections, and settings.",
};

export default function EmployerWorkspaceRoute() {
  return (
    <AuthenticatedWorkspaceGate workspace="employer">
      <NotificationCenter workspace="employer" />
      <EmployerWorkspacePage />
    </AuthenticatedWorkspaceGate>
  );
}

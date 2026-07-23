import type { Metadata } from "next";
import { AuthenticatedWorkspaceGate } from "../_components/authenticated-workspace-gate";
import { WorkerWorkspacePage } from "../_components/role-scoped-workspaces";

export const metadata: Metadata = {
  title: "SAIN - Worker Workspace",
  description:
    "Authenticated worker dashboard for pay, activity, documents, support, career, and profile.",
};

export default function EmployeeWorkspaceRoute() {
  return (
    <AuthenticatedWorkspaceGate workspace="worker">
      <WorkerWorkspacePage />
    </AuthenticatedWorkspaceGate>
  );
}

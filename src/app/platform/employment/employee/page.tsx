import type { Metadata } from "next";
import { WorkerWorkspacePage } from "../_components/role-scoped-workspaces";

export const metadata: Metadata = {
  title: "SAIN - Worker Workspace",
  description:
    "Role-scoped worker dashboard for pay, activity, documents, support, career, and profile.",
};

export default function EmployeeWorkspaceRoute() {
  return <WorkerWorkspacePage />;
}

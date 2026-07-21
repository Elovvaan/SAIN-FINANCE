import type { Metadata } from "next";
import { EmploymentWorkspacePage } from "../_components/employment-platform";

export const metadata: Metadata = {
  title: "SAIN Finance - Employee Workspace",
  description:
    "Employee dashboard, pay timeline, expected pay, pending pay events, profile, activity history, and support entry point.",
};

export default function EmployeeWorkspaceRoute() {
  return <EmploymentWorkspacePage activeWorkspace="employee" />;
}

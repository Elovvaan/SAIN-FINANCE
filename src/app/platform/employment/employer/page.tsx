import type { Metadata } from "next";
import { EmploymentWorkspacePage } from "../_components/employment-platform";

export const metadata: Metadata = {
  title: "SAIN Finance - Employer Workspace",
  description:
    "Employer dashboard, company profile, employee list, payroll status, pending disbursements, corrections, and activity history.",
};

export default function EmployerWorkspaceRoute() {
  return <EmploymentWorkspacePage activeWorkspace="employer" />;
}

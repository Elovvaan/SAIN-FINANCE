import type { Metadata } from "next";
import { EmploymentWorkspacePage } from "../_components/employment-platform";

export const metadata: Metadata = {
  title: "SAIN Finance - Admin Console",
  description:
    "Admin console prototype for claims queue, event log, account states, disputes, reconciliation status, risk flags, and manual review.",
};

export default function AdminConsoleRoute() {
  return <EmploymentWorkspacePage activeWorkspace="admin" />;
}

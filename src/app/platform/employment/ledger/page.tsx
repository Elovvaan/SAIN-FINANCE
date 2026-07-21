import type { Metadata } from "next";
import { EmploymentWorkspacePage } from "../_components/employment-platform";

export const metadata: Metadata = {
  title: "SAIN Finance - Ledger Sandbox",
  description:
    "Mock double-entry ledger sandbox with settled, pending, held, and available projections for admitted sandbox pay events.",
};

export default function LedgerSandboxRoute() {
  return <EmploymentWorkspacePage activeWorkspace="ledger" />;
}

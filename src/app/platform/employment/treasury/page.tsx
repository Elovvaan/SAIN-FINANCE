import type { Metadata } from "next";
import { EmploymentWorkspacePage } from "../_components/employment-platform";

export const metadata: Metadata = {
  title: "SAIN Finance - Treasury and Reserves",
  description:
    "Internal treasury controls, simulated reserve positions, issuance requests, redemption requests, wallet authority, and reconciliation activity.",
};

export default function TreasuryWorkspaceRoute() {
  return <EmploymentWorkspacePage activeWorkspace="treasury" />;
}

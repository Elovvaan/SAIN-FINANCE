import type { Metadata } from "next";
import { EmploymentWorkspacePage } from "../_components/employment-platform";

export const metadata: Metadata = {
  title: "SAIN Finance - Assets and Settlement",
  description:
    "Digital asset records, internal wallets, settlement instructions, escrow positions, and asset activity for the SAIN Finance sandbox.",
};

export default function AssetsWorkspaceRoute() {
  return <EmploymentWorkspacePage activeWorkspace="assets" />;
}

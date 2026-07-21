import type { Metadata } from "next";
import { EmploymentWorkspacePage } from "../_components/employment-platform";

export const metadata: Metadata = {
  title: "SAIN Finance - Financial Kernel Simulator",
  description:
    "Sandbox Financial Kernel simulator for claim, validation, admission, commit, ledger, projection, and response states.",
};

export default function KernelSimulatorRoute() {
  return <EmploymentWorkspacePage activeWorkspace="kernel" />;
}

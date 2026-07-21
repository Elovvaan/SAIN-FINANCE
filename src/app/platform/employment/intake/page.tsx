import type { Metadata } from "next";
import { EmploymentWorkspacePage } from "../_components/employment-platform";

export const metadata: Metadata = {
  title: "SAIN Finance - Pay Event Intake",
  description:
    "Sandbox employer pay event intake for off-cycle pay, bonuses, reimbursements, corrections, final paychecks, and new-hire advances.",
};

export default function PayEventIntakeRoute() {
  return <EmploymentWorkspacePage activeWorkspace="intake" />;
}

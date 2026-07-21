import type { Metadata } from "next";
import { EmploymentWorkspacePage } from "../_components/employment-platform";

export const metadata: Metadata = {
  title: "SAIN Finance - Partner Readiness",
  description:
    "Partner readiness view separating bank-independent employment platform layers from sponsor-bank and regulated partner requirements.",
};

export default function PartnerReadinessRoute() {
  return <EmploymentWorkspacePage activeWorkspace="partner" />;
}

import type { Metadata } from "next";
import { EmploymentWorkspacePage } from "../_components/employment-platform";

export const metadata: Metadata = {
  title: "SAIN Finance - Career OS",
  description:
    "Worker-owned Career OS sandbox for employment timeline, skills passport, document vault, mock job matches, and career recommendations.",
};

export default function CareerOsRoute() {
  return <EmploymentWorkspacePage activeWorkspace="career" />;
}

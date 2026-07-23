import type { Metadata } from "next";
import { StaffingWorkspace } from "./_components/staffing-workspace";

export const metadata: Metadata = {
  title: "Staffing OS | SAIN",
  description: "Persistent recruiter operations, candidate review, and placement pipeline management.",
};

export default function StaffingPage() {
  return <StaffingWorkspace />;
}

import type { Metadata } from "next";
import { EmployerWorkspace } from "./_components/employer-workspace";

export const metadata: Metadata = {
  title: "Employer OS | SAIN",
  description: "Create and manage a persistent employer profile and live job openings.",
};

export default function EmployerPage() {
  return <EmployerWorkspace />;
}

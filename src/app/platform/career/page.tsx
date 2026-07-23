import type { Metadata } from "next";
import { CareerWorkspace } from "./_components/career-workspace";

export const metadata: Metadata = {
  title: "Career OS | SAIN",
  description: "Create a persistent career profile, browse published jobs, submit applications, and track their status.",
};

export default function CareerPage() {
  return <CareerWorkspace />;
}
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "SAIN Finance - Employment Platform Preview",
  description:
    "A pre-bank sandbox prototype for employer, employee, kernel, ledger, admin, and partner-readiness workflows.",
};

export default function EmploymentPlatformPage() {
  redirect("/platform/employment/employer");
}

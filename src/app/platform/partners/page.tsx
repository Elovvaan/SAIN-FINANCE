import type { Metadata } from "next";
import { PartnerCenter } from "./_components/partner-center";

export const metadata: Metadata = {
  title: "SAIN Partner Center",
  description:
    "A private-feeling partner readiness center for sponsor-bank, BaaS, payroll, and infrastructure qualification.",
};

export default function PartnerCenterPage() {
  return <PartnerCenter />;
}

import type { Metadata } from "next";
import { ActivationPage } from "../_components/activation-page";

export const metadata: Metadata = {
  title: "Activate Employer OS | SAIN",
  description:
    "Mock Employer OS activation flow for workforce and payroll-adjacent operations.",
};

export default function EmployerActivationPage() {
  return (
    <ActivationPage
      eyebrow="Employer OS"
      title="Activate your employer workspace."
      subtitle="Model how an organization creates one SAIN Account, verifies business context, and routes into employer operations without connecting live payroll or banking rails."
      workspace="Employer OS"
      steps={[
        "Company Name",
        "Business Email",
        "Industry",
        "Company Size",
        "Verify Business",
        "Continue to Employer OS",
      ]}
      fields={[
        { label: "Company Name", type: "text" },
        { label: "Business Email", type: "email" },
        {
          label: "Industry",
          type: "select",
          options: ["Logistics", "Manufacturing", "Healthcare", "Retail", "Professional Services"],
        },
        {
          label: "Company Size",
          type: "select",
          options: ["1-25 employees", "26-100 employees", "101-500 employees", "500+ employees"],
        },
      ]}
      submitLabel="Continue to Employer OS"
      confirmationTitle="Employer OS activation modeled."
      confirmationCopy="Your mock business profile is ready to route into Employer OS. In a future live system, this step would support employer dashboard access, workforce lists, pay-event intake, and review workflows."
      readinessItems={[
        "Business verification is represented as a mock readiness step for future review.",
        "Employer workflows remain sandbox-only and do not submit live payroll.",
        "The workspace can connect to pay-event intake and admin review surfaces already modeled in SAIN.",
      ]}
    />
  );
}

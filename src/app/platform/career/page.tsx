import type { Metadata } from "next";
import { ActivationPage } from "../_components/activation-page";
import { WorkerValuePlatform } from "./_components/worker-value-platform";

export const metadata: Metadata = {
  title: "Activate Career OS | SAIN",
  description:
    "Mock Career OS activation flow for a worker-owned SAIN workspace.",
};

export default function CareerActivationPage() {
  return (
    <ActivationPage
      eyebrow="Career OS"
      title="Activate your worker-owned career workspace."
      subtitle="Create a SAIN Account, verify your email, and prepare a portable career profile that can travel with you from job to job."
      workspace="Career OS"
      steps={[
        "Create Account",
        "Email",
        "Password",
        "Verify Email",
        "Create Career Profile",
        "Continue to Career OS",
      ]}
      fields={[
        { label: "Email", type: "email" },
        { label: "Password", type: "password", helper: "Mock credential only. Do not use a real password." },
        {
          label: "Career Stage",
          type: "select",
          options: ["Active worker", "Exploring next role", "Recently hired", "Returning to work"],
        },
        { label: "Current Role", type: "text", helper: "Example: Operations Lead" },
      ]}
      submitLabel="Continue to Career OS"
      confirmationTitle="Career OS activation modeled."
      confirmationCopy="Your mock SAIN Account is ready to route into Career OS. In a future live system, this step would lead to profile setup, document vault, skills passport, and career resources."
      readinessItems={[
        "Career profile routing is modeled before any live identity or employment verification.",
        "The worker keeps one SAIN Account even as employers change.",
        "Career OS connects naturally to the existing Employment Platform sandbox.",
      ]}
    >
      <WorkerValuePlatform />
    </ActivationPage>
  );
}

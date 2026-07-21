import type { Metadata } from "next";
import { ActivationPage } from "../_components/activation-page";
import { WorkerValuePlatform } from "./_components/worker-value-platform";

export const metadata: Metadata = {
  title: "Activate Career OS | SAIN",
  description:
    "Career OS activation flow for a worker-owned SAIN workspace.",
};

export default function CareerActivationPage() {
  return (
    <ActivationPage
      eyebrow="Career OS"
      title="Activate your worker-owned career workspace."
      subtitle="Create one SAIN Identity, activate Career OS, and continue into the workspace bootstrap that prepares your portable career record."
      workspace="Career OS"
      steps={[
        "Create SAIN Identity",
        "Verify Email",
        "Activate Career OS",
        "Create Workspace Membership",
        "Assign Worker Role",
        "Continue to Workspace Bootstrap",
      ]}
      fields={[
        { label: "Email", type: "email" },
        { label: "Password", type: "password", helper: "Sandbox credential only. Do not use a real password." },
        {
          label: "Career Stage",
          type: "select",
          options: ["Active worker", "Exploring next role", "Recently hired", "Returning to work"],
        },
        { label: "Current Role", type: "text", helper: "Example: Operations Lead" },
      ]}
      submitLabel="Activate Career OS"
      confirmationTitle="Career OS activated."
      confirmationCopy="Your sandbox SAIN Identity now has a Career OS workspace membership. Continue into workspace bootstrap to build the worker profile, skills passport, document vault, and career record."
      continueHref="/platform/employment/career"
      continueLabel="Begin Career OS Bootstrap"
      readinessItems={[
        "One SAIN Identity remains attached to the worker as employers and roles change.",
        "Workspace activation creates access and role context; it does not duplicate the identity account.",
        "Career OS bootstrap prepares the reusable worker-owned records used by later employment workflows.",
      ]}
    >
      <WorkerValuePlatform />
    </ActivationPage>
  );
}

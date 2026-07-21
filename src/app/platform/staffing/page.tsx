import type { Metadata } from "next";
import { ActivationPage } from "../_components/activation-page";

export const metadata: Metadata = {
  title: "Activate Staffing OS | SAIN",
  description:
    "Mock Staffing OS activation flow for recruiting and workforce placement operations.",
};

export default function StaffingActivationPage() {
  return (
    <ActivationPage
      eyebrow="Staffing OS"
      title="Activate your staffing workspace."
      subtitle="Model how a staffing organization could create one SAIN Account and prepare a workspace for recruiting, placement, and talent operations."
      workspace="Staffing OS"
      steps={[
        "Agency Name",
        "Business Email",
        "Recruiter Count",
        "Locations",
        "Continue to Staffing Workspace",
      ]}
      fields={[
        { label: "Agency Name", type: "text" },
        { label: "Business Email", type: "email" },
        {
          label: "Recruiter Count",
          type: "select",
          options: ["1-5 recruiters", "6-20 recruiters", "21-50 recruiters", "50+ recruiters"],
        },
        { label: "Locations", type: "text", helper: "Example: Denver, Phoenix, Salt Lake City" },
      ]}
      submitLabel="Continue to Staffing Workspace"
      confirmationTitle="Staffing OS activation modeled."
      confirmationCopy="Your mock agency profile is ready to route into Staffing OS. This does not submit applications, call job APIs, or integrate with any staffing system."
      readinessItems={[
        "Staffing OS is framed as an operations workspace, not a staffing agency promise.",
        "Mock talent and placement workflows can later connect to Career OS profiles.",
        "No live job feeds, submissions, or partner integrations are called from this prototype.",
      ]}
    />
  );
}

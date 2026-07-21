import { redirect } from "next/navigation";
import { requireOperatorPage } from "@/server/auth/require-operator-page";

export default async function TreasuryWorkspaceRoute() {
  await requireOperatorPage("/operator/operations?view=treasury");
  redirect("/operator/operations?view=treasury");
}

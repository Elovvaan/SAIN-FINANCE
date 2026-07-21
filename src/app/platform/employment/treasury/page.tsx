import { redirect } from "next/navigation";
import { requireOperatorPage } from "@/server/auth/require-operator-page";

export default async function TreasuryWorkspaceRoute() {
  await requireOperatorPage();
  redirect("/operator/operations?view=treasury");
}

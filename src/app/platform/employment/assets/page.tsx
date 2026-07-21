import { redirect } from "next/navigation";
import { requireOperatorPage } from "@/server/auth/require-operator-page";

export default async function AssetsWorkspaceRoute() {
  await requireOperatorPage();
  redirect("/operator/operations?view=assets");
}

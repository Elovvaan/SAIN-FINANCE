import { redirect } from "next/navigation";
import { requireOperatorPage } from "@/server/auth/require-operator-page";

export default async function PayEventIntakeRoute() {
  await requireOperatorPage();
  redirect("/operator/operations?view=intake");
}

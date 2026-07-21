import { redirect } from "next/navigation";
import { requireOperatorPage } from "@/server/auth/require-operator-page";

export default async function PayEventIntakeRoute() {
  await requireOperatorPage("/operator/operations?view=intake");
  redirect("/operator/operations?view=intake");
}

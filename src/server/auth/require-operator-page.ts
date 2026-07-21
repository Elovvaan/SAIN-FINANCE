import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OPERATOR_COOKIE, verifyOperatorSession } from "./operator-session";

export async function requireOperatorPage(returnTo: string = "/operator/operations") {
  const cookieStore = await cookies();
  const session = verifyOperatorSession(cookieStore.get(OPERATOR_COOKIE)?.value);

  if (!session) {
    const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/operator/operations";
    redirect(`/operator/login?returnTo=${encodeURIComponent(safeReturnTo)}`);
  }

  return session;
}

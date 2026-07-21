import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OPERATOR_COOKIE, verifyOperatorSession } from "./operator-session";

export async function requireOperatorPage() {
  const cookieStore = await cookies();
  const session = verifyOperatorSession(cookieStore.get(OPERATOR_COOKIE)?.value);

  if (!session) {
    redirect("/operator/login?returnTo=/operator/operations");
  }

  return session;
}

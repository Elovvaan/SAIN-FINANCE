import { cookies } from "next/headers";
import { verifyOperatorToken } from "./identity-service";

export const PLATFORM_SESSION_COOKIE = "sain_platform_session";

export async function currentPlatformOperator() {
  const store = await cookies();
  const token = store.get(PLATFORM_SESSION_COOKIE)?.value;
  return verifyOperatorToken(token);
}

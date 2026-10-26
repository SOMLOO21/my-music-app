import { cookies } from "next/headers";
import { endSession, SESSION_COOKIE } from "@/lib/accounts";

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return Response.json({ ok: true }, { headers: { "Set-Cookie": await endSession(token) } });
}

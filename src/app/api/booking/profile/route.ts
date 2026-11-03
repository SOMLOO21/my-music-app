// Booking : profil booking de l'artiste connecté.
import { currentUser } from "@/lib/accounts";
import { getProfile, saveProfile } from "@/booking/repo";
import { body, unauthorized } from "@/booking/session";

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  return Response.json(await getProfile(user.id));
}

export async function PUT(req: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const b = await body(req);
  const pick = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : undefined);
  return Response.json(
    await saveProfile(user.id, {
      stage_name: pick("stage_name"),
      style: pick("style"),
      city: pick("city"),
      epk_url: pick("epk_url"),
      live_url: pick("live_url"),
      smartlink_url: pick("smartlink_url"),
      signature: pick("signature"),
      followup_days: b.followup_days == null ? undefined : Number(b.followup_days),
    }),
  );
}

import { resolveLink } from "@/lib/links";

export async function POST(req: Request) {
  const { url } = (await req.json()) as { url?: string };
  try {
    return Response.json(await resolveLink(String(url ?? "")));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

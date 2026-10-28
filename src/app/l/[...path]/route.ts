// My Music Link — smart links publics (/l/<titre>), redirections vers les plateformes, images.
import { handle } from "hono/vercel";
import app from "@/link/app";

export const dynamic = "force-dynamic";
export const GET = handle(app);
export const POST = handle(app);

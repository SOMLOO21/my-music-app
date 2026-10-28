// My Music Link — espace artiste (/link/…). Toute la logique est dans src/link/app.ts.
import { handle } from "hono/vercel";
import app from "@/link/app";

export const dynamic = "force-dynamic";
export const GET = handle(app);
export const POST = handle(app);

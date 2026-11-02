// SYNCOPE — studio de vidéos courtes (/syncope/…). Toute la logique est dans src/syncope/app.ts.
import { handle } from "hono/vercel";
import app from "@/syncope/app";

export const dynamic = "force-dynamic";
// Conversion d'un hook avec ffmpeg et recopie d'une vidéo importée : jusqu'à quelques minutes.
export const maxDuration = 300;
export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);

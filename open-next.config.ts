import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Toutes les pages sont dynamiques (données en base D1) : pas de cache incrémental.
export default defineCloudflareConfig({});

// Permet aux tests Node de charger directement les fichiers TypeScript de src/ :
// alias « @/… » de tsconfig.json et imports sans extension (« ./normalize » → « ./normalize.ts »).
// Utilisé avec : node --experimental-transform-types --import ./scripts/booking-test-hooks.mjs
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const src = path.join(process.cwd(), "src");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) specifier = pathToFileURL(path.join(src, specifier.slice(2))).href;
    const local = specifier.startsWith(".") || specifier.startsWith("file:");
    if (local && !path.extname(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        // pas un fichier .ts : résolution normale
      }
    }
    return nextResolve(specifier, context);
  },
});

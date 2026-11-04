// Drop : classes Tailwind partagées (même style que /compte et Link).
export const input =
  "w-full rounded-xl border border-white/20 bg-black/40 px-4 py-3 text-base outline-none focus:border-accent";
export const label = "mb-1 block text-xs font-semibold uppercase tracking-wide text-white/50";
export const card = "rounded-2xl border border-white/10 bg-zinc-900 p-4";
export const primary =
  "min-h-11 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-black disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
export const secondary =
  "min-h-11 rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 hover:border-white/50 disabled:opacity-40";
/** Carte à choisir (type, plateformes, inventaire). */
export const choice = (selected: boolean) =>
  `w-full rounded-2xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-accent ${
    selected ? "border-accent bg-accent/10" : "border-white/10 bg-zinc-900 hover:border-white/30"
  }`;

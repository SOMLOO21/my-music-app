// Drop : squelettes affichés pendant le chargement des pages.
export function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/10 motion-reduce:animate-none ${className}`} />;
}

export function PageSkeleton({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-5" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Bar className="h-4 w-48" />
      <Bar className="mt-3 h-9 w-32" />
      <Bar className="mt-3 h-2 w-full" />
      <div className="mt-6 flex gap-2">
        <Bar className="h-11 w-32 rounded-full" />
        <Bar className="h-11 w-24 rounded-full" />
        <Bar className="h-11 w-28 rounded-full" />
      </div>
      <Bar className="mt-6 h-36 w-full" />
      <Bar className="mt-4 h-24 w-full" />
      <Bar className="mt-4 h-24 w-full" />
    </div>
  );
}

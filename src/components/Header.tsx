import Link from "next/link";

export default function Header({ title, backHref = "/" }: { title: string; backHref?: string }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-background/90 px-4 py-3 backdrop-blur">
      <Link href={backHref} className="rounded-full px-2 py-1 text-white/70 hover:text-white" aria-label="Retour">
        ←
      </Link>
      <h1 className="text-lg font-semibold">{title}</h1>
    </header>
  );
}

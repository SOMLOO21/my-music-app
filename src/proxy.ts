// Protection du site en ligne :
// - le fil (/) est public ;
// - l'admin, la page de partage et l'API demandent le mot de passe (SITE_PASSWORD, identifiant libre) ;
// - /api/inbox accepte aussi la clé secrète du Raccourci iPhone (?key=INBOX_KEY).
// En local (`npm run dev`) sans SITE_PASSWORD, tout reste ouvert.
// (Next.js 16 : ce fichier remplace l'ancien middleware.ts.)
import { NextResponse, type NextRequest } from "next/server";

// Seules ces zones demandent le mot de passe ; tout le reste (fil, icônes…) est public.
const PROTECTED = ["/admin", "/partager", "/api"];
// API des comptes artistes : publique (chaque route vérifie elle-même la session).
const PUBLIC_API = ["/api/account", "/api/favorites"];

const under = (pathname: string, prefixes: string[]) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  if (!under(pathname, PROTECTED) || under(pathname, PUBLIC_API)) return NextResponse.next();

  const password = process.env.SITE_PASSWORD;
  if (!password) {
    return process.env.NODE_ENV === "production"
      ? new NextResponse("Site non configuré : définis le secret SITE_PASSWORD.", { status: 503 })
      : NextResponse.next();
  }

  const inboxKey = process.env.INBOX_KEY;
  if (pathname === "/api/inbox" && inboxKey && searchParams.get("key") === inboxKey) {
    return NextResponse.next();
  }

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    const decoded = atob(auth.slice(6));
    if (decoded.slice(decoded.indexOf(":") + 1) === password) return NextResponse.next();
  }

  return new NextResponse("Mot de passe requis.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="My Music App", charset="UTF-8"' },
  });
}

export const config = {
  // Le manifeste reste public pour que l'app puisse s'installer sur l'écran d'accueil.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)"],
};

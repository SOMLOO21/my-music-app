import ShareReceiver from "@/components/ShareReceiver";

// Cible du bouton « Partager » : partage Android (web app installée) ou Raccourci iOS
// qui ouvre /partager?url=<lien>.
export default async function SharePage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; text?: string; title?: string }>;
}) {
  const { url, text, title } = await searchParams;
  return <ShareReceiver shared={{ url, text, title }} />;
}

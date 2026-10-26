// Proposition automatique des tags d'une vidéo.
// 1. IA (Claude) : légende, auteur et miniature -> tags choisis dans les filtres existants.
// 2. Repli sans clé API ou en cas d'erreur : règles sur les hashtags et mots-clés.
import Anthropic from "@anthropic-ai/sdk";
import { FACETS, emptyTags, type ResolvedLink, type Tags, type Taxonomy } from "./types";

export type TagSource = "ai" | "rules";

export async function suggestTags(link: ResolvedLink, taxonomy: Taxonomy): Promise<{ tags: Tags; source: TagSource }> {
  if (process.env.DIGGERS_AI !== "off") {
    try {
      const tags = await classifyWithClaude(link, taxonomy);
      if (tags) return { tags, source: "ai" };
    } catch (e) {
      console.warn("[classify] IA indisponible, repli sur les règles :", (e as Error).message);
    }
  }
  return { tags: classifyWithRules(link, taxonomy), source: "rules" };
}

/** Ne garde que des valeurs qui existent dans les filtres (insensible à la casse). */
function keepKnown(raw: Partial<Record<string, unknown>>, taxonomy: Taxonomy): Tags {
  const tags = emptyTags();
  for (const { key } of FACETS) {
    const values = Array.isArray(raw[key]) ? (raw[key] as unknown[]) : [];
    for (const v of values) {
      const match = taxonomy[key].find((t) => t.toLowerCase() === String(v).toLowerCase());
      if (match && !tags[key].includes(match)) tags[key].push(match);
    }
  }
  return tags;
}

// --- IA ---------------------------------------------------------------------

let client: Anthropic | null = null;

const SYSTEM = `Tu aides l'équipe de Mymusicads, une agence de promotion musicale, à classer des vidéos TikTok et Instagram qui servent d'inspiration de contenu aux artistes.

Pour chaque vidéo, choisis les tags qui la décrivent dans chaque filtre, uniquement parmi les valeurs autorisées :
- type : le format de contenu, ce qu'un artiste pourrait reproduire (en général une seule valeur, deux au maximum).
- genre : le genre musical entendu ou évoqué (artiste repris, hashtags). Laisse vide si tu n'es pas raisonnablement sûr.
- style : la façon dont la vidéo est filmée.
- hook : le mécanisme d'accroche des premières secondes.
- lieu : l'endroit du tournage, visible sur l'image.

Base-toi sur la légende, les hashtags, le compte et l'image. Un tableau vide vaut mieux qu'un tag deviné : l'équipe vérifiera avant publication.`;

async function classifyWithClaude(link: ResolvedLink, taxonomy: Taxonomy): Promise<Tags | null> {
  client ??= new Anthropic();

  const properties = Object.fromEntries(
    FACETS.map(({ key }) => [key, { type: "array", items: { type: "string", enum: taxonomy[key] } }]),
  );
  const schema = { type: "object", properties, required: FACETS.map((f) => f.key), additionalProperties: false };

  const text = [
    `Plateforme : ${link.platform}`,
    `Compte : ${link.author ? `@${link.author}` : "inconnu"}`,
    `Légende : ${link.title || "(aucune)"}`,
    "",
    "Valeurs autorisées :",
    ...FACETS.map(({ key, label }) => `- ${key} (${label}) : ${taxonomy[key].join(" | ")}`),
  ].join("\n");

  const content: Anthropic.Beta.BetaContentBlockParam[] = [{ type: "text", text }];
  if (link.thumbnail) content.unshift({ type: "image", source: { type: "url", url: link.thumbnail } });

  const send = (blocks: Anthropic.Beta.BetaContentBlockParam[]) =>
    client!.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: blocks }],
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);

  let response;
  try {
    response = await send(content);
  } catch (e) {
    // Miniature expirée ou inaccessible : on réessaie avec le texte seul.
    if (e instanceof Anthropic.BadRequestError && link.thumbnail) response = await send(content.slice(1));
    else throw e;
  }

  if (response.stop_reason !== "end_turn") return null;
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return null;
  return keepKnown(JSON.parse(block.text), taxonomy);
}

// --- Règles (repli) ---------------------------------------------------------

const RULES: [RegExp, Partial<Record<keyof Tags, string>>][] = [
  [/cover/, { type: "Cover" }],
  [/acoustic|acoustique|unplugged/, { type: "Version acoustique" }],
  [/\bduet|\bduo\b|duetme/, { type: "Duo", style: "Duo / collab" }],
  [/lipsync|lip sync/, { type: "Lipsync", style: "Face caméra" }],
  [/open ?verse/, { type: "Open verse", hook: "Défi" }],
  [/high ?notes?/, { type: "Hit the high notes", hook: "Défi" }],
  [/transition/, { type: "Transition", hook: "Avant / après" }],
  [/dance|danse|choreo/, { type: "Challenge de danse", hook: "Défi" }],
  [/\blive\b|concert|tour\b|festival/, { type: "Live", lieu: "Scène" }],
  [/\bdj\b|mashup|remix/, { type: "DJ mix / mashup" }],
  [/producertok|beatmaker|producer|composer|making of|process/, { type: "Processus de création", lieu: "Home studio" }],
  [/studio/, { lieu: "Studio" }],
  [/reaction|réaction|react\b/, { type: "Réaction à une sortie", hook: "Réaction" }],
  [/lyrics|speed ?up|sped ?up/, { type: "Lyrics speed up", style: "Texte à l'écran" }],
  [/teaser|snippet|new ?music|out now|pre-?save|coming soon|drops?\b/, { type: "Teaser de sortie" }],
  [/music ?video|\bm\/?v\b|videoclip|\bclip\b/, { type: "Extrait de clip", style: "Clip" }],
  [/behind ?the ?scenes|\bbts\b|backstage|filmmaker/, { type: "Backstage de clip" }],
  [/\brap|hip ?hop|drill|freestyle/, { genre: "Rap" }],
  [/\bpop\b|popmusic/, { genre: "Pop" }],
  [/\br&b|\brnb/, { genre: "R&B" }],
  [/afro/, { genre: "Afro" }],
  [/reggae|dancehall/, { genre: "Reggae" }],
  [/jazz/, { genre: "Jazz" }],
  [/electro|edm|techno|\bhouse\b/, { genre: "Électro" }],
  [/\brock\b|metal|punk/, { genre: "Rock" }],
];

export function classifyWithRules(link: ResolvedLink, taxonomy: Taxonomy): Tags {
  const text = `${link.title} ${link.author}`.toLowerCase();
  const raw: Record<string, string[]> = {};
  for (const [re, tags] of RULES) {
    if (!re.test(text)) continue;
    for (const [key, value] of Object.entries(tags)) (raw[key] ??= []).push(value!);
  }
  return keepKnown(raw, taxonomy);
}

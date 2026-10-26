// Appels à l'API depuis le navigateur.
import type { FacetKey, ResolvedLink, Tags, Taxonomy, Video, VideoStatus } from "./types";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Une erreur est survenue.");
  return data as T;
}

export const resolve = (url: string) =>
  call<ResolvedLink>("/api/resolve", { method: "POST", body: JSON.stringify({ url }) });

export const createVideo = (video: ResolvedLink & { tags: Tags; comment: string }) =>
  call<Video>("/api/videos", { method: "POST", body: JSON.stringify(video) });

export const updateVideo = (
  id: string,
  patch: { tags?: Tags; comment?: string; title?: string; status?: VideoStatus },
) => call<Video>(`/api/videos/${id}`, { method: "PATCH", body: JSON.stringify(patch) });

export const suggestTags = (link: ResolvedLink) =>
  call<{ tags: Tags; source: "ai" | "rules" }>("/api/classify", { method: "POST", body: JSON.stringify(link) });

export const sendToInbox = (shared: { url?: string; text?: string; title?: string }) =>
  call<{ result: "added" | "duplicate"; video: Video }>("/api/inbox", { method: "POST", body: JSON.stringify(shared) });

export const deleteVideo = (id: string) => call<{ ok: true }>(`/api/videos/${id}`, { method: "DELETE" });

export const addTag = (facet: FacetKey, value: string) =>
  call<Taxonomy>("/api/taxonomy", { method: "POST", body: JSON.stringify({ facet, value }) });

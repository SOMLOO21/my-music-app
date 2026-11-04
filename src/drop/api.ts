// Drop : appels aux routes /api/drop depuis le navigateur.
import type { StatusId } from "./config/schema";
import type { ReleaseView, Task } from "./types";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401) throw new Error("Ta session a expiré : reconnecte-toi.");
  if (!res.ok) throw new Error(data.error ?? "La modification n'a pas été enregistrée, réessaie dans un instant.");
  return data as T;
}
const json = (method: string, data: unknown): RequestInit => ({ method, body: JSON.stringify(data) });

export interface TaskPatchBody {
  title?: string;
  status?: StatusId;
  dueDate?: string;
  notes?: string | null;
  linkUrl?: string | null;
  checklist?: { label: string; done: boolean }[];
  position?: number;
}

export const patchTask = (id: string, patch: TaskPatchBody) => call<Task>(`/api/drop/tasks/${id}`, json("PATCH", patch));

export const reorder = (releaseId: string, items: { id: string; status: StatusId; position: number }[]) =>
  call<{ ok: true }>(`/api/drop/releases/${releaseId}/order`, json("POST", { items }));

export interface NewTaskBody {
  title: string;
  dueDate: string;
  module: string;
  platforms: string[];
  notes: string | null;
  trackId: string | null;
}
export const createTask = (releaseId: string, body: NewTaskBody) => call<Task>(`/api/drop/releases/${releaseId}/tasks`, json("POST", body));
export const duplicateTask = (id: string) => call<Task>(`/api/drop/tasks/${id}/duplicate`, { method: "POST" });
export const deleteTask = (id: string) => call<{ ok: true }>(`/api/drop/tasks/${id}`, { method: "DELETE" });

export interface SettingsBody {
  releaseDate?: string;
  platforms?: string[];
  ownedAssets?: string[];
  assetQuantities?: Record<string, number>;
  adminEnabled?: boolean;
  includeLocked?: boolean;
}
export interface SettingsPreview {
  summary: string;
  mode: string;
  warnings: { code: string; message: string }[];
  lockedSkipped: number;
  moves: { id: string; key: string; from: string; to: string; title: string }[];
  additions: { key: string; title: string; dueDate: string }[];
  removals: { id: string; key: string; title: string }[];
}
export const previewSettings = (releaseId: string, body: SettingsBody) =>
  call<SettingsPreview>(`/api/drop/releases/${releaseId}/settings?apercu=1`, json("POST", body));
export const applySettings = (releaseId: string, body: SettingsBody) =>
  call<{ summary: string; mode: string }>(`/api/drop/releases/${releaseId}/settings`, json("POST", body));
export const duplicateRelease = (releaseId: string) =>
  call<{ id: string }>(`/api/drop/releases/${releaseId}/duplicate`, { method: "POST" });
export const deleteRelease = (releaseId: string) => call<{ ok: true }>(`/api/drop/releases/${releaseId}`, { method: "DELETE" });
export const getReleaseView = (releaseId: string) => call<ReleaseView>(`/api/drop/releases/${releaseId}`);

// Drop : appels aux routes /api/drop depuis le navigateur.
import type { StatusId } from "./config/schema";
import type { Task } from "./types";

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

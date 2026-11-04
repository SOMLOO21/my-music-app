// Drop : types des données enregistrées (tables drop_*), tels que renvoyés par src/drop/repo.ts.
import type { ModeId, ModuleId, PhaseId, PlatformId, PriorityId, ReleaseType, StatusId } from "./config/schema";
import type { PlanWarning } from "./engine/types";

export type Role = "owner" | "editor" | "viewer";
export type MemberRole = Exclude<Role, "owner">;

export interface Release {
  id: string;
  owner_id: string;
  type: ReleaseType;
  title: string;
  artist_name: string;
  release_date: string;
  clip_is_relaunch: boolean;
  platforms: PlatformId[];
  owned_assets: string[];
  admin_enabled: boolean;
  mode: ModeId;
  warnings: PlanWarning[];
  dismissed_keys: string[];
  config_version: string;
  created_at: string;
  updated_at: string;
}

export interface Track {
  id: string;
  release_id: string;
  position: number;
  title: string;
  is_focus_single: boolean;
  single_release_date: string | null;
  has_clip: boolean;
  clip_release_date: string | null;
}

export interface ChecklistItem {
  label: string;
  done: boolean;
}

export interface Task {
  id: string;
  release_id: string;
  track_id: string | null;
  plan_key: string | null;
  template_task_id: string | null;
  title: string;
  phase: PhaseId;
  module: ModuleId;
  priority: PriorityId;
  platforms: PlatformId[];
  formats: string[];
  status: StatusId;
  due_date: string;
  offset_days: number | null;
  date_locked: boolean;
  why: string | null;
  how: string[];
  ideas: string[];
  checklist: ChecklistItem[];
  alert: string | null;
  notes: string | null;
  link_url: string | null;
  position: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Member {
  user_id: string;
  pseudo: string;
  first_name: string;
  last_name: string;
  role: MemberRole;
  created_at: string;
}

export interface ShareLink {
  id: string;
  token: string;
  created_at: string;
}

/** Carte d'une sortie sur l'accueil /drop. */
export interface ReleaseSummary {
  id: string;
  type: ReleaseType;
  title: string;
  artist_name: string;
  release_date: string;
  mode: ModeId;
  role: Role;
  total: number;
  done: number;
  late: number;
  next_task: { title: string; due_date: string } | null;
}

/** Une sortie ouverte par un compte qui y a accès. */
export interface ReleaseView {
  role: Role;
  release: Release;
  tracks: Track[];
  tasks: Task[];
}

/** Tâche sur la page publique : ni notes, ni lien, ni sous-étapes. */
export type PublicTask = Omit<Task, "notes" | "link_url" | "checklist" | "release_id" | "plan_key">;

export interface PublicRelease {
  release: Pick<Release, "type" | "title" | "artist_name" | "release_date" | "mode" | "platforms">;
  tracks: Pick<Track, "id" | "position" | "title" | "is_focus_single" | "single_release_date" | "has_clip">[];
  tasks: PublicTask[];
}

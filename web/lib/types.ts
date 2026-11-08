/**
 * JSON shapes the web app expects from the frozen API (docs/CONTRACTS.md).
 * Field names are snake_case so they match the Python backend.
 * A change here is a contract change — say so in team chat first.
 */

export type SourceType =
  | "resident"
  | "staff"
  | "emh"
  | "document"
  | "inferred"
  | "pattern";

export type ChipTone = SourceType | "task";

export type Tile = {
  id: string;
  label: string;
  category: string;
  cloudinary_id: string | null;
};

export type Resident = {
  id: string;
  name: string;
  voice_id: string | null;
  communication_style: string;
  tiles: Tile[];
};

export type StoryChapter = {
  id: string;
  chapter_key: string;
  title: string;
  text: string;
  photo_ids: string[];
  audio_url: string | null;
  status: "draft" | "approved";
};

export type PendingMemory = {
  id: string;
  type: "preference" | "event" | "routine";
  content: string;
  source: SourceType;
  source_date: string | null;
  times_seen: number | null;
  /** Set when the Consolidator put a confirmed fact back in the queue. */
  update_reason: string | null;
};

export type HandoffItem = {
  type: "emh" | "checklist" | "observation" | "choice" | "task" | "memory";
  date: string;
  text: string;
  source?: SourceType;
  /** Client-only hints for the timeline; inferred from text for live rows. */
  status?: "done" | "missed";
  significant?: boolean;
  author?: string;
};

export type ActivityItem = {
  kind: "action" | "choice" | "sentence";
  text: string;
  created_at: string;
  status: string;
};

export type SourcedFact = {
  type: SourceType;
  date: string | null;
  label?: string;
  update_reason?: string | null;
};

export type CoachAnswer = {
  answer: string;
  sources: (SourcedFact & { label?: string })[];
};

export type ChoiceOption = {
  label: string;
  photo: string | null;
  cost: number;
  money_left?: number | null;
  consequence?: string;
};

export type ChoiceResult = {
  id: number | string;
  question: string;
  weekly_budget: number | null;
  status: "chosen" | "not_yet_decided";
  options: ChoiceOption[];
};

export type ChoicePreview = {
  question: string;
  weekly_budget: number | null;
  options: { label: string; cost: number; description?: string; when?: string }[];
  status: "chosen" | "not_yet_decided";
  chosen: string | null;
};

export type Highlight = {
  text: string;
  source: SourceType;
  date: string | null;
  author?: string;
};

/** Client view of a resident's profile, grouped for staff screens. */
export type ResidentProfile = {
  home: string;
  summary: Highlight | null;
  communication: Highlight[];
  routines: Highlight[];
  likes: Highlight[];
  dislikes: Highlight[];
  context: Highlight[];
  observations: Highlight[];
  pending: Highlight[];
};

export type DataOrigin = "api" | "sample";

export type Result<T> = {
  data: T;
  origin: DataOrigin;
};

export type MutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type AgentNote = {
  id: string;
  name: string;
  note: string;
};

export type ActionPlan = {
  plan_id: number;
  goal: string;
  online_steps: { step: string; detail: string; cost: number }[];
  staff_tasks: { task: string; due: string | null }[];
  total_cost: number;
  status: "proposed";
  agents: AgentNote[];
};

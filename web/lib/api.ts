import { cache } from "react";
import { chapterTitle } from "./format";
import {
  homeFor,
  sampleProfile,
  sampleActivity,
  sampleHandoff,
  samplePending,
  sampleResident,
  sampleStory,
} from "./mock";
import type {
  ActionPlan as ActionPlanShape,
  AgentNote,
  ActivityItem,
  ChoiceResult,
  CoachAnswer,
  HandoffItem,
  Highlight,
  MutationResult,
  PendingMemory,
  Resident,
  ResidentProfile,
  Result,
  SourceType,
  StoryChapter,
  Tile,
} from "./types";
import type { PlannerVisit, StaffOption } from "./planner";
export type { AgentNote };
export type ActionPlan = ActionPlanShape;

function apiBaseUrl(): string {
  const configured = (process.env.API_BASE_URL ?? "").replace(/\/$/, "");
  const serverLocal =
    !configured || configured.includes("127.0.0.1") || configured.includes("localhost");
  // The API listens on the server. A browser that calls that address is talking
  // to the resident's own machine, so client calls go through the /backend proxy.
  if (serverLocal && typeof window !== "undefined") return "/backend";
  return configured || "http://127.0.0.1:8000";
}

async function fetchJson(path: string): Promise<unknown | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function sendJson<T>(
  path: string,
  body?: unknown,
  method: "POST" | "PUT" | "GET" = "POST",
): Promise<MutationResult<T>> {
  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      method,
      headers: method === "GET" ? undefined : { "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if (!response.ok) {
      return { ok: false, error: `The API returned ${response.status}.` };
    }
    const raw = await response.text();
    const data = (raw ? JSON.parse(raw) : {}) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, error: "The API is not reachable." };
  }
}

function record(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Ids arrive as numbers from Postgres and as strings from mocks. */
function idText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return text(value);
}

function list(value: unknown, key: string): unknown[] | null {
  if (Array.isArray(value)) return value;
  const row = record(value);
  if (row && Array.isArray(row[key])) return row[key];
  return null;
}

const SOURCES = new Set<SourceType>([
  "resident",
  "staff",
  "emh",
  "document",
  "inferred",
  "pattern",
]);

function sourceType(value: unknown): SourceType | null {
  return typeof value === "string" && SOURCES.has(value as SourceType)
    ? (value as SourceType)
    : null;
}

function normalizeTile(value: unknown, index: number): Tile | null {
  const row = record(value);
  if (!row) return null;
  const label = text(row.label);
  if (!label) return null;
  return {
    id: idText(row.id) ?? `${label}-${index}`,
    label,
    category: text(row.category) ?? "words",
    cloudinary_id: text(row.cloudinary_id),
  };
}

function normalizeResident(id: string, value: unknown): Resident | null {
  const row = record(value);
  if (!row) return null;
  const name = text(row.name);
  const tiles = Array.isArray(row.tiles)
    ? row.tiles.map(normalizeTile).filter((tile): tile is Tile => tile !== null)
    : null;
  if (!name || !tiles) return null;
  return {
    id,
    name,
    voice_id: text(row.voice_id),
    communication_style: text(row.communication_style) ?? "",
    tiles,
  };
}

function normalizeChapter(value: unknown, index: number): StoryChapter | null {
  const row = record(value);
  if (!row) return null;
  const chapterKey = text(row.chapter_key) ?? text(row.chapter);
  const body = text(row.text);
  if (!chapterKey || !body) return null;
  const status = row.status === "approved" ? "approved" : "draft";
  return {
    id: idText(row.id) ?? `${chapterKey}-${index}`,
    chapter_key: chapterKey,
    title: text(row.title) ?? chapterTitle(chapterKey),
    text: body,
    photo_ids: Array.isArray(row.photo_ids)
      ? row.photo_ids.filter((photo): photo is string => typeof photo === "string")
      : [],
    audio_url: text(row.audio_url),
    status,
  };
}

function normalizeMemory(value: unknown, index: number): PendingMemory | null {
  const row = record(value);
  if (!row) return null;
  const content = text(row.content);
  const source = sourceType(row.source);
  const type = row.type;
  if (!content || !source) return null;
  if (type !== "preference" && type !== "event" && type !== "routine") return null;
  return {
    id:
      typeof row.id === "number" && Number.isFinite(row.id)
        ? String(row.id)
        : text(row.id) ?? `memory-${index}`,
    type,
    content,
    source,
    source_date: text(row.source_date) ?? text(row.date),
    times_seen: typeof row.times_seen === "number" ? row.times_seen : null,
    update_reason: text(row.update_reason),
  };
}

function normalizeHandoff(value: unknown): HandoffItem | null {
  const row = record(value);
  if (!row) return null;
  const itemText = text(row.text) ?? text(row.content);
  const date = text(row.date);
  // The handoff agent labels EMH rows by table; fold them into the contract types.
  const type =
    row.type === "emh_checklist" ? "checklist" : row.type === "emh_note" ? "emh" : row.type;
  if (!itemText || !date) return null;
  if (
    type !== "emh" &&
    type !== "checklist" &&
    type !== "observation" &&
    type !== "choice" &&
    type !== "task" &&
    type !== "memory"
  ) {
    return null;
  }
  // Live rows carry no done/missed flag; read it from the wording.
  const missed =
    type === "checklist" && /didn't|did not|not happen|cancel|ended early|left early/i.test(itemText);
  return {
    type,
    date,
    text: itemText,
    source: sourceType(row.source) ?? (type === "memory" ? "resident" : undefined),
    status: type === "checklist" ? (missed ? "missed" : "done") : undefined,
  };
}

function normalizeActivity(value: unknown): ActivityItem | null {
  const row = record(value);
  if (!row) return null;
  const itemText = text(row.text);
  const createdAt = text(row.created_at) ?? text(row.date);
  const kind = row.kind;
  if (!itemText || !createdAt) return null;
  if (kind !== "action" && kind !== "choice" && kind !== "sentence") return null;
  return {
    kind,
    text: itemText,
    created_at: createdAt,
    status: text(row.status) ?? "",
  };
}

export const getResident = cache(async (id: string): Promise<Result<Resident> | null> => {
  const sample = sampleResident(id);
  const live = normalizeResident(id, await fetchJson(`/residents/${encodeURIComponent(id)}`));
  if (live) return { data: live, origin: "api" };
  if (sample) return { data: sample, origin: "sample" };
  return null;
});

function normalizeHighlight(value: unknown): Highlight | null {
  const row = record(value);
  if (!row) return null;
  const content = text(row.content) ?? text(row.text);
  const source = sourceType(row.source);
  if (!content || !source) return null;
  return { text: content, source, date: text(row.date) ?? text(row.source_date) };
}

function highlights(value: unknown): Highlight[] | null {
  if (!Array.isArray(value)) return null;
  return value.map(normalizeHighlight).filter((item): item is Highlight => item !== null);
}

/**
 * Staff profile view. Live: the confirmed memories the profile MCP server
 * returns with /residents/{id}. Sample: the grouped demo profile.
 */
export const getProfile = cache(
  async (id: string): Promise<Result<ResidentProfile> | null> => {
    const raw = record(await fetchJson(`/residents/${encodeURIComponent(id)}`));
    const preferences = highlights(raw?.preferences);
    const routines = highlights(raw?.routines);
    if (raw && preferences && routines) {
      const style = text(raw.communication_style);
      const resident = preferences.filter((item) => item.source === "resident");
      return {
        origin: "api",
        data: {
          home: homeFor(id),
          summary: resident[0] ?? null,
          communication: style ? [{ text: style, source: "document", date: null }] : [],
          routines,
          likes: preferences,
          dislikes: [],
          context: [],
          observations: [],
          pending: highlights(raw.pending_patterns) ?? [],
        },
      };
    }
    const sample = sampleProfile(id);
    return sample ? { data: sample, origin: "sample" } : null;
  },
);

export const getStory = cache(async (id: string): Promise<Result<StoryChapter[]>> => {
  const live = list(await fetchJson(`/story/${encodeURIComponent(id)}`), "chapters")
    ?.map(normalizeChapter)
    .filter((chapter): chapter is StoryChapter => chapter !== null);
  if (live) return { data: live, origin: "api" };
  return { data: sampleStory(id) ?? [], origin: "sample" };
});

export const getPendingMemories = cache(async (id: string): Promise<Result<PendingMemory[]>> => {
  const live = list(
    await fetchJson(`/memories/pending/${encodeURIComponent(id)}`),
    "memories",
  )
    ?.map(normalizeMemory)
    .filter((memory): memory is PendingMemory => memory !== null);
  if (live) return { data: live, origin: "api" };
  return { data: samplePending(id) ?? [], origin: "sample" };
});

export const getHandoff = cache(
  async (staffId: string, residentId: string): Promise<Result<HandoffItem[]>> => {
    const params = new URLSearchParams({
      staff_id: staffId,
      resident_id: residentId,
    });
    const live = list(await fetchJson(`/handoff?${params}`), "items")
      ?.map(normalizeHandoff)
      .filter((item): item is HandoffItem => item !== null);
    if (live) return { data: live, origin: "api" };
    return { data: sampleHandoff(residentId) ?? [], origin: "sample" };
  },
);

export const getActivity = cache(async (id: string): Promise<Result<ActivityItem[]>> => {
  const live = list(await fetchJson(`/activity/${encodeURIComponent(id)}`), "items")
    ?.map(normalizeActivity)
    .filter((item): item is ActivityItem => item !== null);
  if (live) return { data: live, origin: "api" };
  return { data: sampleActivity(id) ?? [], origin: "sample" };
});

export function setVoice(residentId: string, voiceId: string) {
  return sendJson<{ ok: boolean }>(
    `/residents/${encodeURIComponent(residentId)}/voice`,
    { voice_id: voiceId },
    "PUT",
  );
}

export function suggestSentences(input: {
  resident_id: string;
  tiles: string[];
  time: string;
}) {
  return sendJson<{ options: string[] }>("/suggest", input);
}

/** A signed URL to start one Story (T1.4) or Coach (T1.6) voice session. Null if unavailable. */
export async function agentSession(kind: "story" | "coach"): Promise<string | null> {
  const data = (await fetchJson(`/agents/${kind}/session`)) as { signed_url?: unknown } | null;
  return typeof data?.signed_url === "string" ? data.signed_url : null;
}

export function speak(input: { resident_id: string; text: string }) {
  return sendJson<{ audio_url: string }>("/speak", input);
}

export function logSentence(input: {
  resident_id: string;
  tiles: string[];
  chosen_text: string;
  approved: boolean;
}) {
  return sendJson<{ id: string }>("/sentences", input);
}

export function saveStoryAnswer(input: {
  resident_id: string;
  chapter: string;
  question: string;
  answer: string;
}) {
  return sendJson<{ ok: boolean; id?: number }>("/story/answer", input);
}

export function getStoryAnswers(residentId: string, chapter?: string) {
  const params = new URLSearchParams();
  if (chapter) params.set("chapter", chapter);
  const query = params.size ? `?${params}` : "";
  return sendJson<{ answers: { question: string; answer: string; chapter?: string }[] }>(
    `/story/${encodeURIComponent(residentId)}/answers${query}`,
    undefined,
    "GET",
  );
}

export function draftStory(input: { resident_id: string; chapter: string }) {
  return sendJson<{ text: string; chapter_id: number; status: string; audio_url: string | null }>(
    "/story/draft",
    input,
  );
}

export function approveStory(input: { chapter_id: number }) {
  return sendJson<{ audio_url: string; cached?: boolean }>("/story/approve", input);
}

export function askCoach(input: { resident_id: string; question: string }) {
  return sendJson<CoachAnswer>("/coach/ask", input);
}

export function createChoice(input: {
  resident_id: string;
  question: string;
  options: { label: string; photo: string | null; cost: number }[];
}) {
  return sendJson<ChoiceResult>("/choices", input);
}

export function decideChoice(choiceId: string, chosen: string) {
  return sendJson<{ ok: boolean; status?: "chosen" | "not_yet_decided" }>(
    `/choices/${encodeURIComponent(choiceId)}/decide`,
    { chosen },
  );
}

function normalizePlan(value: unknown): ActionPlan | null {
  const row = record(value);
  if (!row) return null;
  const planId = row.plan_id;
  const goal = text(row.goal);
  const steps = list(row.online_steps, "online_steps");
  const tasks = list(row.staff_tasks, "staff_tasks");
  const total = row.total_cost;
  if (typeof planId !== "number" || !goal || !steps || !tasks || typeof total !== "number") {
    return null;
  }
  const agents = Array.isArray(row.agents)
    ? row.agents.flatMap((item) => {
        const agent = record(item);
        const id = agent ? text(agent.id) : null;
        const agentName = agent ? text(agent.name) : null;
        const note = agent ? text(agent.note) : null;
        if (!agent || !id || !agentName || !note) return [];
        return [{ id, name: agentName, note }];
      })
    : [];
  return {
    plan_id: planId,
    goal,
    total_cost: total,
    status: "proposed",
    agents,
    online_steps: steps.flatMap((item) => {
      const step = record(item);
      const name = step ? text(step.step) : null;
      const detail = step ? text(step.detail) : null;
      if (!step || !name || !detail) return [];
      return [{ step: name, detail, cost: typeof step.cost === "number" ? step.cost : 0 }];
    }),
    staff_tasks: tasks.flatMap((item) => {
      const task = record(item);
      const name = task ? text(task.task) : null;
      if (!task || !name) return [];
      return [{ task: name, due: text(task.due) }];
    }),
  };
}

export async function planActions(input: { resident_id: string; goal: string }) {
  const result = await sendJson<unknown>("/actions/plan", input);
  if (!result.ok) return result;
  const plan = normalizePlan(result.data);
  if (!plan) return { ok: false as const, error: "The plan did not include its steps." };
  return { ok: true as const, data: plan };
}

export function approveAction(planId: string, residentId: string) {
  const params = new URLSearchParams({ resident_id: residentId });
  return sendJson<{ results?: { step: string; result: string }[]; status?: string }>(
    `/actions/${encodeURIComponent(planId)}/approve?${params}`,
    {},
  );
}

export function cancelAction(planId: string, residentId: string) {
  const params = new URLSearchParams({ resident_id: residentId });
  return sendJson<{ plan_id?: number; status?: string; error?: string }>(
    `/actions/${encodeURIComponent(planId)}/cancel?${params}`,
    {},
  );
}

export function confirmMemory(memoryId: string, answer: "yes" | "no", residentId: string) {
  return sendJson<{ ok: boolean }>(
    `/memories/${encodeURIComponent(memoryId)}/confirm`,
    { confirmed: answer === "yes", resident_id: residentId },
  );
}

export type VoiceOption = {
  voice_id: string;
  label: string;
  preview_text: string;
  preview_url: string;
};

export function getVoices(residentId: string) {
  return sendJson<{ current: string | null; options: VoiceOption[] }>(
    `/voices/${encodeURIComponent(residentId)}`,
    undefined,
    "GET",
  );
}

export function addObservation(input: {
  resident_id: string;
  staff_id: string;
  note: string;
}) {
  return sendJson<{ ok: boolean }>("/observations", input);
}

export type UploadConfig = {
  cloud_name: string;
  upload_preset: string;
};

export async function getUploadConfig(): Promise<MutationResult<UploadConfig>> {
  try {
    const response = await fetch(`${apiBaseUrl()}/media/upload`, { cache: "no-store" });
    const raw = await response.text();
    const data = (raw ? JSON.parse(raw) : {}) as {
      cloud_name?: unknown;
      upload_preset?: unknown;
      detail?: unknown;
    };
    if (!response.ok) {
      const detail = typeof data.detail === "string" ? data.detail : null;
      return { ok: false, error: detail ?? `The API returned ${response.status}.` };
    }
    if (typeof data.cloud_name !== "string" || typeof data.upload_preset !== "string") {
      return { ok: false, error: "The API did not return an upload preset." };
    }
    return {
      ok: true,
      data: { cloud_name: data.cloud_name, upload_preset: data.upload_preset },
    };
  } catch {
    return { ok: false, error: "The API is not reachable." };
  }
}

export type SavedPhoto = {
  resident_id: string;
  cloudinary_id: string;
  label: string | null;
  /** From the photo subagents (agents/photos). */
  status?: "saved" | "needs_review" | "saved_offline";
  /** saved: the tile as stored (a same-label tile gets the new photo). */
  tile?: { id: number | string; label: string; category: string | null; cloudinary_id: string };
  replaced?: boolean;
  /** false when the photo check couldn't run; the staff label was used. */
  checked?: boolean;
  /** What the checker saw in the photo. */
  shows?: string | null;
  /** needs_review: why staff should look before saving. */
  reasons?: string[];
  category?: string;
  reason?: string;
};

export async function savePhoto(input: {
  resident_id: string;
  public_id: string;
  label: string;
  /** Staff chose "Save anyway" after a needs_review answer. */
  confirmed?: boolean;
}): Promise<MutationResult<SavedPhoto>> {
  try {
    const response = await fetch(`${apiBaseUrl()}/media/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    });
    const raw = await response.text();
    const data = (raw ? JSON.parse(raw) : {}) as SavedPhoto & { detail?: unknown };
    if (!response.ok) {
      const detail = typeof data.detail === "string" ? data.detail : null;
      return { ok: false, error: detail ?? `The API returned ${response.status}.` };
    }
    if (typeof data.cloudinary_id !== "string") {
      return { ok: false, error: "The API did not return a photo id." };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "The API is not reachable." };
  }
}

// ---------- Gaze/gesture input (docs/GAZE_GESTURE_PLAN.md §7) ----------

import type { InputEvent, InputProfile } from "./input/types";
import { DEFAULT_PROFILE } from "./input/profile";

/** Batched OUTCOME events from the input controller, never video. */
export function postInputEvents(events: InputEvent[]) {
  return sendJson<{ saved: number }>("/input-events", { events });
}

/** How this resident communicates best, from input history (G6/G7). */
export async function getInputProfile(residentId: string): Promise<InputProfile> {
  const raw = await fetchJson(`/input-profile/${residentId}`);
  const row = record(raw);
  if (!row) return { ...DEFAULT_PROFILE, resident_id: residentId };
  return {
    resident_id: residentId,
    preferred_select:
      row.preferred_select === "gaze" || row.preferred_select === "gesture"
        ? row.preferred_select
        : "touch",
    preferred_yes: text(row.preferred_yes) ?? "touch",
    dwell_ms: typeof row.dwell_ms === "number" ? row.dwell_ms : 1000,
    rates: (record(row.rates) ?? {}) as InputProfile["rates"],
    notes: Array.isArray(row.notes) ? row.notes.filter((n): n is string => typeof n === "string") : [],
    events_counted: typeof row.events_counted === "number" ? row.events_counted : 0,
    confidence:
      row.confidence === "high" || row.confidence === "medium" ? row.confidence : "low",
  };
}

// ---------- G8: personal gestures ----------

import type { TaughtGesture } from "./input/custom-gestures";

export function saveCustomGesture(input: {
  resident_id: string;
  tile: string;
  samples: number[][];
}) {
  return sendJson<{ ok: boolean; tile: string }>("/custom-gestures", input);
}

export async function getCustomGestures(residentId: string): Promise<TaughtGesture[]> {
  const raw = await fetchJson(`/custom-gestures/${residentId}`);
  const rows = list(raw, "gestures");
  if (!rows) return [];
  return rows.flatMap((row) => {
    const item = record(row);
    const label = item ? text(item.tile_label) : null;
    if (!item || !label || !Array.isArray(item.samples)) return [];
    return [{ tile_label: label, samples: item.samples as number[][] }];
  });
}

// ---------- Records library (ROADMAP Phase 3) ----------

export type ResidentRecord = {
  id: number;
  title: string;
  category: string;
  author: string | null;
  doc_date: string | null;
  uploaded_at: string;
  body: string;
};

export async function getRecords(residentId: string): Promise<ResidentRecord[]> {
  const raw = await fetchJson(`/records/${residentId}`);
  const rows = list(raw, "records");
  if (!rows) return [];
  return rows.flatMap((row) => {
    const item = record(row);
    if (!item || typeof item.title !== "string") return [];
    return [item as unknown as ResidentRecord];
  });
}

export function addRecord(input: {
  resident_id: string;
  title: string;
  body: string;
  category: string;
  author?: string;
  doc_date?: string;
}) {
  return sendJson<{ ok: boolean; id: number }>("/records", input);
}

// ---------- Custom cards (ROADMAP Phase 4) ----------

export function addTile(input: {
  resident_id: string;
  label: string;
  cloudinary_id: string;
  category?: string;
}) {
  return sendJson<{ ok: boolean; tile: Tile | null }>("/tiles", input);
}

export function setTileArchived(tileId: string | number, residentId: string, archived: boolean) {
  return sendJson<{ ok: boolean; archived: boolean }>(`/tiles/${tileId}/archive`, {
    resident_id: residentId,
    archived,
  });
}

/** Uncached resident fetch for client components that just mutated tiles. */
export async function getResidentFresh(id: string): Promise<Resident | null> {
  return normalizeResident(id, await fetchJson(`/residents/${encodeURIComponent(id)}`));
}

// ---------- My Planner (PROJECT_PLAN §2.5) ----------

/** Who residents can choose when the planner API is not answering. */
const SAMPLE_STAFF: StaffOption[] = [
  { id: "sam", name: "Sam" },
  { id: "jordan", name: "Jordan" },
];

function normalizeVisit(value: unknown): PlannerVisit | null {
  const row = record(value);
  const starts = text(row?.starts_at);
  const ends = text(row?.ends_at);
  if (!row || !starts || !ends) return null;
  const source = row.source === "staff" || row.source === "inferred" ? row.source : "resident";
  return {
    id: typeof row.id === "number" ? row.id : null,
    staff: text(row.staff) ?? "",
    starts_at: starts,
    ends_at: ends,
    source,
    label: text(row.label) ?? "",
    approved: row.approved === true,
    google_synced: row.google_synced === true,
    read_only: row.read_only === true,
    title: text(row.title) ?? undefined,
    all_day: row.all_day === true,
  };
}

function visitsOf(value: unknown): PlannerVisit[] | null {
  return list(value, "visits")
    ?.map(normalizeVisit)
    .filter((v): v is PlannerVisit => v !== null) ?? null;
}

export type PlannerWeek = { visits: PlannerVisit[]; staff: StaffOption[] };

export async function getPlanner(id: string): Promise<Result<PlannerWeek>> {
  const raw = record(await fetchJson(`/planner/${encodeURIComponent(id)}`));
  const visits = raw && !raw.error ? visitsOf(raw) : null;
  if (raw && visits) {
    const staff = (Array.isArray(raw.staff) ? raw.staff : [])
      .map((s) => record(s))
      .flatMap((s) => (s && text(s.id) && text(s.name) ? [{ id: text(s.id)!, name: text(s.name)! }] : []));
    return { data: { visits, staff: staff.length ? staff : SAMPLE_STAFF }, origin: "api" };
  }
  return { data: { visits: [], staff: SAMPLE_STAFF }, origin: "sample" };
}

export type RoutineInput = {
  resident_id: string;
  person: string;
  start: string;
  length_min: number;
  days?: string[] | null;
  start_date?: string;
};

/** The server answers 200 with {"error"} or {"refused"} for planner refusals. */
async function plannerCall(path: string, body: unknown): Promise<MutationResult<Record<string, unknown>>> {
  const result = await sendJson<Record<string, unknown>>(path, body);
  if (!result.ok) return result;
  const data = record(result.data);
  if (!data) return { ok: false, error: "The planner sent an empty answer." };
  if (data.refused || data.error) return { ok: false, error: text(data.error) ?? "That was not allowed." };
  return { ok: true, data };
}

/** The approval card's week preview. The server saves nothing (rule 1). */
export async function previewRoutine(input: RoutineInput): Promise<MutationResult<PlannerVisit[]>> {
  const result = await plannerCall("/planner/preview", input);
  if (!result.ok) return result;
  return { ok: true, data: visitsOf(result.data) ?? [] };
}

export async function saveRoutine(
  input: RoutineInput,
): Promise<MutationResult<{ routine_id: number; visits: PlannerVisit[] }>> {
  const result = await plannerCall("/planner/routine", input);
  if (!result.ok) return result;
  const id = result.data.routine_id;
  if (typeof id !== "number") return { ok: false, error: "The routine was not saved." };
  return { ok: true, data: { routine_id: id, visits: visitsOf(result.data) ?? [] } };
}

export type Booking = {
  visits: PlannerVisit[];
  google_synced: boolean;
  planner: string;
};

/** After approval: the Planner subagent puts the visits on staff's calendar. */
export async function bookVisits(input: {
  resident_id: string;
  routine_id: number;
  approved: boolean;
}): Promise<MutationResult<Booking>> {
  const result = await plannerCall("/planner/book", input);
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      visits: visitsOf(result.data) ?? [],
      google_synced: result.data.google_synced === true,
      planner: text(result.data.planner) ?? "rules",
    },
  };
}

/** Fallback: a staff .zip calendar export, shown read-only on the grid. */
export async function importCalendarView(input: {
  resident_id: string;
  calendar_zip_b64: string;
  /** First day of the window shown (the grid's Sunday); the server expands repeats into it. */
  start_date?: string;
  days?: number;
}): Promise<MutationResult<PlannerVisit[]>> {
  const result = await plannerCall("/planner/import", input);
  if (!result.ok) return result;
  return { ok: true, data: (visitsOf(result.data) ?? []).map((v) => ({ ...v, read_only: true })) };
}

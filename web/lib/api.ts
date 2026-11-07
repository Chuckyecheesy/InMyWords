import { cache } from "react";
import { chapterTitle } from "./format";
import {
  sampleActivity,
  sampleHandoff,
  samplePending,
  sampleResident,
  sampleStory,
} from "./mock";
import type {
  ActivityItem,
  ChoiceOption,
  CoachAnswer,
  HandoffItem,
  MutationResult,
  PendingMemory,
  Resident,
  Result,
  SourceType,
  StoryChapter,
  Tile,
} from "./types";

function apiBaseUrl(): string {
  return (process.env.API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");
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
  body: unknown,
  method: "POST" | "PUT" = "POST",
): Promise<MutationResult<T>> {
  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
    id: text(row.id) ?? `${label}-${index}`,
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
    id: text(row.id) ?? `${chapterKey}-${index}`,
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
    id: text(row.id) ?? `memory-${index}`,
    type,
    content,
    source,
    source_date: text(row.source_date) ?? text(row.date),
  };
}

function normalizeHandoff(value: unknown): HandoffItem | null {
  const row = record(value);
  if (!row) return null;
  const itemText = text(row.text) ?? text(row.content);
  const date = text(row.date);
  const type = row.type;
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
  return {
    type,
    date,
    text: itemText,
    source: sourceType(row.source) ?? undefined,
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
  return sendJson<{ ok: boolean }>("/story/answer", input);
}

export function draftStory(input: { resident_id: string; chapter: string }) {
  return sendJson<{ text: string }>("/story/draft", input);
}

export function approveStory(input: { chapter_id: string }) {
  return sendJson<{ audio_url: string }>("/story/approve", input);
}

export function askCoach(input: { resident_id: string; question: string }) {
  return sendJson<CoachAnswer>("/coach/ask", input);
}

export function createChoice(input: {
  resident_id: string;
  question: string;
  options: ChoiceOption[];
}) {
  return sendJson<{ id: string; options: ChoiceOption[] }>("/choices", input);
}

export function decideChoice(
  choiceId: string,
  input: { status: "chosen" | "not_yet_decided"; chosen?: string },
) {
  return sendJson<{ ok: boolean }>(
    `/choices/${encodeURIComponent(choiceId)}/decide`,
    input,
  );
}

export function planActions(input: { resident_id: string; goal: string }) {
  return sendJson<{
    steps: unknown[];
    staff_tasks: unknown[];
    total_cost: number;
  }>("/actions/plan", input);
}

export function approveAction(planId: string) {
  return sendJson<{ results: unknown[] }>(
    `/actions/${encodeURIComponent(planId)}/approve`,
    {},
  );
}

export function confirmMemory(memoryId: string, answer: "yes" | "no") {
  return sendJson<{ ok: boolean }>(
    `/memories/${encodeURIComponent(memoryId)}/confirm`,
    { answer },
  );
}

export function addObservation(input: {
  resident_id: string;
  staff_id: string;
  note: string;
}) {
  return sendJson<{ ok: boolean }>("/observations", input);
}

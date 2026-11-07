import type {
  ActivityItem,
  ChoicePreview,
  CoachAnswer,
  Highlight,
  HandoffItem,
  PendingMemory,
  Resident,
  StoryChapter,
  Tile,
} from "./types";

/** Fictional demo people. Ids stay stable until T2 publishes real ones. */
export const DEMO_RESIDENT_IDS = ["marcus", "dana"] as const;
export const DEMO_STAFF = { id: "jordan", name: "Jordan" };

function tiles(rows: [string, string][]): Tile[] {
  return rows.map(([label, category]) => ({
    id: label.toLowerCase().replaceAll(" ", "-"),
    label,
    category,
    cloudinary_id: null,
  }));
}

const residents: Record<string, Resident> = {
  marcus: {
    id: "marcus",
    name: "Marcus",
    voice_id: null,
    communication_style: "Single words and gestures",
    tiles: tiles([
      ["coffee", "drinks"],
      ["tea", "drinks"],
      ["bowling", "activities"],
      ["Raptors", "activities"],
      ["music", "activities"],
      ["park", "places"],
      ["bus", "places"],
      ["quiet", "feelings"],
      ["Lisa", "people"],
      ["help", "words"],
      ["yes", "words"],
      ["no", "words"],
    ]),
  },
  dana: {
    id: "dana",
    name: "Dana",
    voice_id: null,
    communication_style: "Picture tiles. More independent.",
    tiles: tiles([
      ["tea", "drinks"],
      ["garden", "activities"],
      ["walk", "activities"],
      ["TV", "activities"],
      ["herbs", "activities"],
      ["groceries", "errands"],
      ["money", "errands"],
      ["sister", "people"],
      ["balcony", "places"],
      ["help", "words"],
      ["yes", "words"],
      ["no", "words"],
    ]),
  },
};

const chapters: Record<string, StoryChapter[]> = {
  marcus: [
    {
      id: "marcus-about",
      chapter_key: "about_me",
      title: "About me",
      text: "I am Marcus. I like bowling on Saturdays. Loud rooms upset me.",
      photo_ids: [],
      audio_url: null,
      status: "draft",
    },
    {
      id: "marcus-love",
      chapter_key: "things_i_love",
      title: "Things I love",
      text: "I love the Raptors. I like a double-double from Tim's.",
      photo_ids: [],
      audio_url: null,
      status: "draft",
    },
  ],
  dana: [
    {
      id: "dana-about",
      chapter_key: "about_me",
      title: "About me",
      text: "I am Dana. I love my garden.",
      photo_ids: [],
      audio_url: null,
      status: "draft",
    },
    {
      id: "dana-people",
      chapter_key: "people",
      title: "People who matter",
      text: "My sister visits on Sundays.",
      photo_ids: [],
      audio_url: null,
      status: "draft",
    },
  ],
};

const essentials: Record<string, Highlight[]> = {
  marcus: [
    { text: "I like bowling on Saturdays.", source: "resident", date: null },
    { text: "Drinks coffee.", source: "document", date: "2019-06-01" },
  ],
  dana: [
    { text: "I love gardening.", source: "resident", date: null },
    {
      text: "Weekly budget is $60.",
      source: "staff",
      date: "2026-10-20",
    },
  ],
};

const routines: Record<string, Highlight[]> = {
  marcus: [
    { text: "Coffee around 7:30.", source: "inferred", date: "2026-11-07" },
  ],
  dana: [
    { text: "Sister visits on Sundays.", source: "resident", date: null },
  ],
};

const coach: Record<string, CoachAnswer & { question: string }> = {
  marcus: {
    question: "What upsets Marcus?",
    answer: "Loud rooms upset Marcus.",
    sources: [{ type: "resident", date: null }],
  },
  dana: {
    question: "What does Dana enjoy?",
    answer: "Dana loves gardening, and her sister visits on Sundays.",
    sources: [{ type: "resident", date: null }],
  },
};

const pending: Record<string, PendingMemory[]> = {
  marcus: [
    {
      id: "mem-tea",
      type: "preference",
      content: "Marcus has been choosing tea this week.",
      source: "inferred",
      source_date: "2026-11-07",
    },
  ],
  dana: [],
};

const handoff: Record<string, HandoffItem[]> = {
  marcus: [
    {
      type: "checklist",
      date: "2026-11-06",
      text: "Grocery shopping didn't happen. The bus was cancelled.",
    },
    {
      type: "observation",
      date: "2026-11-05",
      text: "Marcus asked to sit somewhere quiet after lunch.",
    },
  ],
  dana: [
    {
      type: "emh",
      date: "2026-11-04",
      text: "Dana worked in the garden with her sister.",
    },
  ],
};

const activity: Record<string, ActivityItem[]> = {
  marcus: [
    {
      kind: "sentence",
      text: "I want coffee.",
      created_at: "2026-11-06T14:10:00Z",
      status: "approved",
    },
    {
      kind: "choice",
      text: "Bowling or a movie",
      created_at: "2026-11-07T16:00:00Z",
      status: "not_yet_decided",
    },
  ],
  dana: [
    {
      kind: "choice",
      text: "Herb garden or groceries",
      created_at: "2026-11-03T18:30:00Z",
      status: "not_yet_decided",
    },
  ],
};

const choices: Record<string, ChoicePreview> = {
  marcus: {
    question: "Bowling or a movie this Saturday?",
    weekly_budget: null,
    options: [
      { label: "Bowling", cost: 15 },
      { label: "Movie", cost: 12 },
    ],
    status: "not_yet_decided",
    chosen: null,
  },
  dana: {
    question: "Herb garden or groceries this week?",
    weekly_budget: 60,
    options: [
      { label: "Herb garden", cost: 22 },
      { label: "Groceries", cost: 40 },
    ],
    status: "not_yet_decided",
    chosen: null,
  },
};

function byId<T>(table: Record<string, T>, id: string): T | null {
  return table[id.toLowerCase()] ?? null;
}

export function sampleResident(id: string): Resident | null {
  const resident = byId(residents, id);
  return resident ? { ...resident, tiles: resident.tiles.map((tile) => ({ ...tile })) } : null;
}

export function sampleStory(id: string): StoryChapter[] | null {
  const rows = byId(chapters, id);
  return rows ? rows.map((chapter) => ({ ...chapter })) : null;
}

export function sampleEssentials(id: string): Highlight[] {
  return (byId(essentials, id) ?? []).map((item) => ({ ...item }));
}

export function sampleRoutines(id: string): Highlight[] {
  return (byId(routines, id) ?? []).map((item) => ({ ...item }));
}

export function sampleCoach(id: string): (CoachAnswer & { question: string }) | null {
  const row = byId(coach, id);
  return row ? { ...row, sources: row.sources.map((source) => ({ ...source })) } : null;
}

export function samplePending(id: string): PendingMemory[] | null {
  const rows = byId(pending, id);
  return rows ? rows.map((memory) => ({ ...memory })) : null;
}

export function sampleHandoff(id: string): HandoffItem[] | null {
  const rows = byId(handoff, id);
  return rows ? rows.map((item) => ({ ...item })) : null;
}

export function sampleActivity(id: string): ActivityItem[] | null {
  const rows = byId(activity, id);
  return rows ? rows.map((item) => ({ ...item })) : null;
}

export function sampleChoice(id: string): ChoicePreview | null {
  const row = byId(choices, id);
  return row ? { ...row, options: row.options.map((option) => ({ ...option })) } : null;
}

export function openingLine(id: string): Highlight | null {
  return sampleEssentials(id)[0] ?? null;
}

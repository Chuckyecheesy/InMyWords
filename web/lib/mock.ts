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
    { text: "Drinks coffee.", source: "document", date: "2021-03-15" },
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

const coach: Record<string, Array<{ question: string; answer: string; sources: Array<{ type: "resident" | "staff" | "emh" | "document" | "pattern"; date: string | null }> }>> = {
  marcus: [
    {
      question: "What does Marcus like to do?",
      answer: "Marcus enjoys bowling on Saturdays and watching the Raptors.",
      sources: [
        { type: "resident", date: "2026-01-08T10:30:00Z" },
        { type: "pattern", date: "2026-01-10T14:00:00Z" },
      ],
    },
    {
      question: "Does Marcus have a routine?",
      answer: "Yes, Marcus goes bowling every Saturday afternoon at 2pm.",
      sources: [
        { type: "pattern", date: "2026-01-10T14:00:00Z" },
        { type: "staff", date: "2026-01-15T09:00:00Z" },
      ],
    },
    {
      question: "What's Marcus's communication style?",
      answer: "Marcus uses AAC tiles to communicate and responds to yes/no questions.",
      sources: [
        { type: "resident", date: "2026-01-08T10:30:00Z" },
        { type: "document", date: "2019-01-01T00:00:00Z" },
      ],
    },
    {
      question: "What upsets Marcus?",
      answer: "Loud noises and rushed transitions upset Marcus.",
      sources: [
        { type: "staff", date: "2026-01-15T09:00:00Z" },
        { type: "document", date: "2019-01-01T00:00:00Z" },
      ],
    },
    {
      question: "Does Marcus prefer tea or coffee?",
      answer: "Marcus has switched to tea recently. He picked tea 5 times this week.",
      sources: [
        { type: "pattern", date: "2026-01-10T14:00:00Z" },
        { type: "resident", date: "2026-01-15T14:23:00Z" },
      ],
    },
    {
      question: "Who's important to Marcus?",
      answer: "His sister Lisa and his staff member Lisa are both very important to him.",
      sources: [
        { type: "resident", date: "2026-01-08T10:30:00Z" },
        { type: "staff", date: "2026-01-10T15:30:00Z" },
      ],
    },
    {
      question: "What's Marcus's story?",
      answer: "Marcus's story covers his background, values, and what matters to him.",
      sources: [
        { type: "resident", date: "2026-01-08T10:30:00Z" },
      ],
    },
    {
      question: "Does Marcus have any patterns?",
      answer: "Yes, Marcus has tea after breakfast and goes to the park on sunny days.",
      sources: [
        { type: "pattern", date: "2026-01-10T14:00:00Z" },
      ],
    },
    {
      question: "Can Marcus go bowling?",
      answer: "Yes, Marcus loves bowling. It costs $15 per session and he has budget for it.",
      sources: [
        { type: "resident", date: "2026-01-08T10:30:00Z" },
        { type: "staff", date: "2026-01-15T09:00:00Z" },
      ],
    },
    {
      question: "What's Marcus's weekly budget?",
      answer: "Marcus has a weekly discretionary budget of $60.",
      sources: [
        { type: "resident", date: "2026-01-08T10:30:00Z" },
        { type: "document", date: "2019-01-01T00:00:00Z" },
      ],
    },
    {
      question: "Any recent observations about Marcus?",
      answer: "Staff noted that Marcus seemed calm during the morning routine yesterday.",
      sources: [
        { type: "staff", date: "2026-01-15T09:00:00Z" },
        { type: "emh", date: "2026-01-15T08:00:00Z" },
      ],
    },
    {
      question: "What's in Marcus's binder or records?",
      answer: "The binder notes Marcus enjoys activities and prefers quiet spaces.",
      sources: [
        { type: "document", date: "2019-01-01T00:00:00Z" },
      ],
    },
    {
      question: "How does Marcus prefer to communicate?",
      answer: "Marcus uses AAC tiles and responds to spoken questions with yes/no tiles.",
      sources: [
        { type: "resident", date: "2026-01-08T10:30:00Z" },
        { type: "document", date: "2019-01-01T00:00:00Z" },
      ],
    },
    {
      question: "What changed with Marcus this week?",
      answer: "Marcus has shifted from coffee to tea, and staff noted increased calm.",
      sources: [
        { type: "pattern", date: "2026-01-10T14:00:00Z" },
        { type: "staff", date: "2026-01-15T09:00:00Z" },
      ],
    },
    {
      question: "What should I know before my first shift?",
      answer: "Marcus is communicative, follows routines, prefers calm settings, and has a solid support network. Ask if you're unsure.",
      sources: [
        { type: "resident", date: "2026-01-08T10:30:00Z" },
        { type: "staff", date: "2026-01-15T09:00:00Z" },
      ],
    },
  ],
  dana: [
    {
      question: "What does Dana like?",
      answer: "Dana loves gardening and growing vegetables.",
      sources: [
        { type: "resident", date: "2026-01-08T10:30:00Z" },
      ],
    },
    {
      question: "Who's important to Dana?",
      answer: "Dana's sister visits on Sundays. They drink tea together.",
      sources: [
        { type: "resident", date: "2026-01-08T10:30:00Z" },
        { type: "staff", date: "2026-01-15T09:00:00Z" },
      ],
    },
  ],
};

const pending: Record<string, PendingMemory[]> = {
  marcus: [
    {
      id: "mem-tea",
      type: "preference",
      content: "Marcus has been choosing tea this week.",
      source: "inferred",
      source_date: "2026-11-07",
      times_seen: 5,
      update_reason: null,
    },
    {
      id: "mem-coffee",
      type: "preference",
      content: "Drinks coffee.",
      source: "document",
      source_date: "2019-01-01",
      times_seen: 1,
      update_reason: "Recent pattern contradicts: tea 5x this week",
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

export function sampleCoach(id: string): (CoachAnswer & { question: string })[] {
  const rows = byId(coach, id);
  return rows ? rows.map((row) => ({
    question: row.question,
    answer: row.answer,
    sources: row.sources.map((source) => ({ ...source }))
  })) : [];
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

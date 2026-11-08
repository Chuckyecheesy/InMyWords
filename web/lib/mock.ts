import type {
  ActivityItem,
  ChoicePreview,
  CoachAnswer,
  Highlight,
  HandoffItem,
  PendingMemory,
  Resident,
  ResidentProfile,
  StoryChapter,
  Tile,
} from "./types";

/**
 * Sample data, used only when the API does not answer. Every screen shows
 * a "Sample data" note when it falls back here, so nothing below is ever
 * presented as live.
 *
 * It tells one story, drawn from db/seed: Marcus (34) lives at Maple House,
 * loves the Raptors and Saturday bowling, orders a double-double, talks to
 * his sister Lisa every week, finds loud rooms hard, and has picked tea five
 * times this week — a pattern still waiting for his confirmation.
 */
export const DEMO_RESIDENT_IDS = ["marcus", "dana"] as const;
export const DEMO_STAFF = { id: "jordan", name: "Jordan", home: "Maple House" };

/** Photos shipped in public/demo/tiles (see public/demo/credits.json). */
const DEMO_TILE_PHOTOS = new Set([
  "dana_bus", "dana_garden", "dana_groceries", "dana_help", "dana_herbs", "dana_later",
  "dana_money", "dana_no", "dana_sister", "dana_tea", "dana_tv", "dana_walk", "dana_yes",
  "marcus_bowling", "marcus_bus", "marcus_coffee", "marcus_help", "marcus_later",
  "marcus_lisa", "marcus_movie", "marcus_music", "marcus_no", "marcus_park", "marcus_quiet",
  "marcus_raptors", "marcus_tea", "marcus_yes",
]);

function tiles(resident: string, rows: [string, string][]): Tile[] {
  return rows.map(([label, category]) => {
    const key = `${resident}_${label.toLowerCase().replaceAll(" ", "_")}`;
    return {
      id: label.toLowerCase().replaceAll(" ", "-"),
      label,
      category,
      cloudinary_id: DEMO_TILE_PHOTOS.has(key) ? `tiles/${key}` : null,
    };
  });
}

const residents: Record<string, Resident> = {
  marcus: {
    id: "marcus",
    name: "Marcus",
    voice_id: null,
    communication_style: "Single words and gestures. Picture tiles. Needs quiet to focus.",
    tiles: tiles("marcus", [
      ["coffee", "food & drink"],
      ["tea", "food & drink"],
      ["food", "food & drink"],
      ["bowling", "activities"],
      ["Raptors", "activities"],
      ["music", "activities"],
      ["movie", "activities"],
      ["park", "places"],
      ["bus", "places"],
      ["home", "places"],
      ["Lisa", "people"],
      ["quiet", "feelings"],
      ["happy", "feelings"],
      ["tired", "feelings"],
      ["help", "feelings"],
      ["later", "answers"],
      ["yes", "answers"],
      ["no", "answers"],
    ]),
  },
  dana: {
    id: "dana",
    name: "Dana",
    voice_id: null,
    communication_style: "Picture tiles. More independent.",
    tiles: tiles("dana", [
      ["tea", "food & drink"],
      ["garden", "activities"],
      ["walk", "activities"],
      ["TV", "activities"],
      ["herbs", "activities"],
      ["groceries", "errands"],
      ["money", "errands"],
      ["sister", "people"],
      ["balcony", "places"],
      ["help", "feelings"],
      ["yes", "answers"],
      ["no", "answers"],
    ]),
  },
};

const chapters: Record<string, StoryChapter[]> = {
  marcus: [
    {
      id: "marcus-about",
      chapter_key: "about_me",
      title: "About me",
      text: "I'm Marcus. I'm 34. I love the Raptors and bowling on Saturdays. My coffee order is a double-double from Tim's. Loud rooms are hard for me. Quiet helps.",
      photo_ids: ["story/marcus_portrait", "story/marcus_bowling"],
      audio_url: null,
      status: "approved",
    },
    {
      id: "marcus-people",
      chapter_key: "people_who_matter",
      title: "People who matter",
      text: "My sister Lisa calls me every week. She takes me to Raptors games on TV nights. I want her to come bowling with me.",
      photo_ids: ["story/marcus_lisa"],
      audio_url: null,
      status: "draft",
    },
    {
      id: "marcus-love",
      chapter_key: "things_i_love",
      title: "Things I love",
      text: "Saturdays are my bowling days. I high-five the lane attendant. One day I want to see the Raptors play for real.",
      photo_ids: ["tiles/marcus_raptors"],
      audio_url: null,
      status: "draft",
    },
    {
      id: "marcus-places",
      chapter_key: "favourite_places",
      title: "My favourite places",
      text: "The bowling alley on Saturday. The park when it's sunny. My room with my music when I need some quiet.",
      photo_ids: [],
      audio_url: null,
      status: "draft",
    },
    {
      id: "marcus-day",
      chapter_key: "my_day",
      title: "My daily life",
      text: "I like a slow, quiet morning. A hot drink with breakfast around 7:30. Day program in the afternoon, then music in my room.",
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
      text: "I am Dana. I love my garden, and I grow my own herbs on the balcony.",
      photo_ids: ["story/dana_garden"],
      audio_url: null,
      status: "approved",
    },
    {
      id: "dana-people",
      chapter_key: "people_who_matter",
      title: "People who matter",
      text: "My sister visits on Sundays. We have tea on the porch.",
      photo_ids: [],
      audio_url: null,
      status: "draft",
    },
  ],
};

const RECORDS = "2021-03-15";

const profiles: Record<string, ResidentProfile> = {
  marcus: {
    home: "Maple House",
    summary: {
      text: "I love the Raptors and bowling on Saturdays. Loud rooms are hard for me. Quiet helps.",
      source: "resident",
      date: "2026-11-02",
    },
    communication: [
      { text: "Single words and gestures. Picture tiles. Needs quiet to focus.", source: "document", date: RECORDS },
      { text: "Ask one question at a time, then wait. He answers yes or no with a tile or a nod.", source: "staff", date: "2026-10-30", author: "Sam" },
      { text: "When he builds a sentence, he approves it before it is spoken. Don't finish it for him.", source: "staff", date: "2026-11-03", author: "Priya" },
    ],
    routines: [
      { text: "Hot drink with breakfast around 7:30am.", source: "document", date: RECORDS },
      { text: "Bowling on Saturday afternoons, usually 2pm.", source: "resident", date: "2026-11-01" },
      { text: "Music in his room after the day program.", source: "emh", date: "2026-11-04", author: "Sam" },
    ],
    likes: [
      { text: "The Toronto Raptors. My goal is to see a live game.", source: "resident", date: "2026-11-02" },
      { text: "Bowling on Saturdays.", source: "resident", date: "2026-11-01" },
      { text: "A double-double from Tim Hortons.", source: "document", date: RECORDS },
    ],
    dislikes: [
      { text: "Loud rooms are upsetting. Quiet spaces and headphones help.", source: "resident", date: "2026-10-29" },
      { text: "Rushed transitions. Give a heads-up before it's time to leave.", source: "staff", date: "2026-10-29", author: "Sam" },
    ],
    context: [
      { text: "Sister Lisa is his main contact. They talk on the phone every week.", source: "document", date: RECORDS },
      { text: "Weekly spending money is $40.", source: "staff", date: "2026-10-20", author: "Priya" },
    ],
    observations: [
      { text: "Pointed at the kettle at breakfast and picked the tea tile. Seemed pleased with it.", source: "emh", date: "2026-11-06", author: "Sam" },
      { text: "Bowling went great. High-fived the lane attendant and signed 'again' on the way out.", source: "emh", date: "2026-11-01", author: "Sam" },
      { text: "Mall trip cut short — the food court was loud and he covered his ears. Calm once outside.", source: "emh", date: "2026-10-29", author: "Sam" },
    ],
    pending: [
      { text: "Likes tea now (picked tea 5 times this week after months of coffee).", source: "inferred", date: "2026-11-06" },
    ],
  },
  dana: {
    home: "Birch House",
    summary: { text: "I love my garden.", source: "resident", date: "2026-11-02" },
    communication: [
      { text: "Picture tiles. More independent.", source: "document", date: RECORDS },
    ],
    routines: [
      { text: "My sister visits on Sundays.", source: "resident", date: "2026-10-25" },
      { text: "Evening walk most days.", source: "emh", date: "2026-11-06", author: "Sam" },
    ],
    likes: [
      { text: "Growing herbs on the balcony.", source: "resident", date: "2026-11-05" },
      { text: "Tea with my sister on the porch.", source: "resident", date: "2026-10-25" },
    ],
    dislikes: [],
    context: [
      { text: "Weekly budget is $60.", source: "staff", date: "2026-10-20", author: "Priya" },
    ],
    observations: [
      { text: "Repotted the kitchen basil without prompting. Asked for 'more herbs' with her tiles.", source: "emh", date: "2026-11-05", author: "Sam" },
      { text: "Counted out her grocery money herself this week.", source: "emh", date: "2026-11-02", author: "Priya" },
    ],
    pending: [],
  },
};

type CoachEntry = {
  keywords: string[];
  answer: CoachAnswer;
};

const coach: Record<string, CoachEntry[]> = {
  marcus: [
    {
      keywords: ["upset", "upsets", "loud", "noise", "angry", "calm", "settle", "distress"],
      answer: {
        answer:
          "Loud, busy rooms are hard for Marcus — a mall trip on Oct 29 was cut short because the food court was too loud. Moving somewhere quiet and offering his headphones helps him settle. Give him a heads-up before it's time to leave somewhere.",
        sources: [
          { type: "resident", date: "2026-10-29" },
          { type: "emh", date: "2026-10-29" },
          { type: "staff", date: "2026-10-29" },
        ],
      },
    },
    {
      keywords: ["communicate", "communication", "talk", "speak", "tiles", "understand", "say"],
      answer: {
        answer:
          "Marcus uses picture tiles, single words and gestures. Ask one question at a time and wait — he'll answer yes or no with a tile or a nod. When he builds a sentence in Speak For Me, he approves it before it is spoken.",
        sources: [
          { type: "document", date: RECORDS },
          { type: "staff", date: "2026-10-30" },
        ],
      },
    },
    {
      keywords: ["like", "likes", "enjoy", "enjoys", "fun", "love", "hobby", "hobbies", "bowling", "raptors"],
      answer: {
        answer:
          "Marcus loves the Toronto Raptors — his goal is to see a live game. He bowls on Saturday afternoons, usually at 2pm, and listens to music in his room after the day program.",
        sources: [
          { type: "resident", date: "2026-11-02" },
          { type: "resident", date: "2026-11-01" },
          { type: "emh", date: "2026-11-04" },
        ],
      },
    },
    {
      keywords: ["morning", "breakfast", "wake", "routine", "routines", "schedule", "day"],
      answer: {
        answer:
          "Marcus prefers a slow, quiet morning. He has a hot drink with breakfast around 7:30am. Saturdays are bowling days, usually at 2pm.",
        sources: [
          { type: "document", date: RECORDS },
          { type: "resident", date: "2026-11-01" },
        ],
      },
    },
    {
      keywords: ["tea", "coffee", "drink", "drinks", "double-double", "tim"],
      answer: {
        answer:
          "His 2021 records say coffee — a double-double from Tim Hortons. This week he picked tea 5 times. That's a pattern noticed, not yet confirmed by Marcus, so offer both and let him choose.",
        sources: [
          { type: "document", date: RECORDS },
          { type: "inferred", date: "2026-11-06" },
        ],
      },
    },
    {
      keywords: ["important", "family", "sister", "lisa", "who", "friends", "contact"],
      answer: {
        answer:
          "His sister Lisa is his main contact. She calls every week — on Oct 26 he held the phone with both hands the whole time, smiling.",
        sources: [
          { type: "resident", date: "2026-11-02" },
          { type: "document", date: RECORDS },
          { type: "emh", date: "2026-10-26" },
        ],
      },
    },
    {
      keywords: ["budget", "money", "cost", "spend", "afford"],
      answer: {
        answer: "Marcus has $40 a week of spending money. Bowling costs $15 and a movie costs $12.",
        sources: [{ type: "staff", date: "2026-10-20" }],
      },
    },
  ],
  dana: [
    {
      keywords: ["like", "likes", "enjoy", "garden", "love", "hobby"],
      answer: {
        answer: "Dana loves gardening and grows her own herbs on the balcony.",
        sources: [{ type: "resident", date: "2026-11-05" }],
      },
    },
    {
      keywords: ["important", "sister", "family", "who"],
      answer: {
        answer: "Dana's sister visits on Sundays. They have tea on the porch together.",
        sources: [
          { type: "resident", date: "2026-10-25" },
          { type: "emh", date: "2026-10-25" },
        ],
      },
    },
  ],
};

const coachQuestions: Record<string, string[]> = {
  marcus: [
    "What upsets Marcus?",
    "How does Marcus communicate?",
    "What does Marcus enjoy?",
    "Does Marcus prefer tea or coffee?",
    "What is Marcus's morning like?",
    "Who is important to Marcus?",
  ],
  dana: ["What does Dana enjoy?", "Who is important to Dana?"],
};

const pending: Record<string, PendingMemory[]> = {
  marcus: [
    {
      id: "mem-tea",
      type: "preference",
      content: "Marcus has been choosing tea this week.",
      source: "inferred",
      source_date: "2026-11-06",
      times_seen: 5,
      update_reason: null,
    },
    {
      id: "mem-coffee",
      type: "preference",
      content: "Drinks coffee — a double-double from Tim Hortons.",
      source: "document",
      source_date: "2021-03-15",
      times_seen: 1,
      update_reason: "Recent pattern contradicts: tea 5x this week",
    },
  ],
  dana: [],
};

const handoff: Record<string, HandoffItem[]> = {
  marcus: [
    { type: "checklist", date: "2026-11-06", text: "Morning routine done.", status: "done" },
    {
      type: "emh",
      date: "2026-11-06",
      text: "Marcus pointed at the kettle again at breakfast and picked the tea tile. Seemed pleased with it.",
      author: "Sam",
    },
    {
      type: "memory",
      date: "2026-11-06",
      text: "Pattern noticed: tea 5 times this week. Waiting for Marcus to confirm.",
      source: "inferred",
    },
    {
      type: "checklist",
      date: "2026-11-05",
      text: "Grocery shopping didn't happen — the bus was cancelled.",
      status: "missed",
    },
    {
      type: "observation",
      date: "2026-11-05",
      text: "Marcus asked to sit somewhere quiet after lunch.",
      author: "Priya",
    },
    {
      type: "emh",
      date: "2026-11-04",
      text: "Quiet afternoon. Marcus listened to music in his room after the day program.",
      author: "Sam",
    },
    { type: "checklist", date: "2026-11-01", text: "Saturday bowling done.", status: "done" },
    {
      type: "emh",
      date: "2026-11-01",
      text: "Bowling went great. Marcus high-fived the lane attendant and signed 'again' on the way out.",
      author: "Sam",
    },
    {
      type: "checklist",
      date: "2026-10-29",
      text: "Community outing ended early — the food court was too loud for Marcus.",
      status: "missed",
      significant: true,
    },
  ],
  dana: [
    { type: "checklist", date: "2026-11-06", text: "Evening walk done.", status: "done" },
    {
      type: "emh",
      date: "2026-11-05",
      text: "Dana repotted the kitchen basil without prompting. Asked for 'more herbs' with her tiles.",
      author: "Sam",
    },
    {
      type: "emh",
      date: "2026-11-02",
      text: "Budget session: Dana counted out her grocery money herself this week.",
      author: "Priya",
    },
  ],
};

const activity: Record<string, ActivityItem[]> = {
  marcus: [
    {
      kind: "choice",
      text: "Bowling or a movie this Saturday",
      created_at: "2026-11-07T16:00:00Z",
      status: "not_yet_decided",
    },
    {
      kind: "sentence",
      text: "Can I get a double-double from Tim's?",
      created_at: "2026-11-06T14:10:00Z",
      status: "approved",
    },
    {
      kind: "sentence",
      text: "I'd like somewhere quiet, please.",
      created_at: "2026-11-05T13:05:00Z",
      status: "approved",
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
    question: "What would you like to do this Saturday?",
    weekly_budget: 40,
    options: [
      {
        label: "Bowling",
        cost: 15,
        when: "Saturday, 2pm",
        description: "Two games at the lanes, with shoe rental.",
      },
      {
        label: "Movie",
        cost: 12,
        when: "Saturday, 2pm",
        description: "An afternoon film at the cinema.",
      },
    ],
    status: "not_yet_decided",
    chosen: null,
  },
  dana: {
    question: "What would you like to do this week?",
    weekly_budget: 60,
    options: [
      { label: "Herb garden", cost: 22, when: "This week", description: "New pots and seedlings for the balcony." },
      { label: "Groceries", cost: 40, when: "This week", description: "A big shop at the market." },
    ],
    status: "not_yet_decided",
    chosen: null,
  },
};

function byId<T>(table: Record<string, T>, id: string): T | null {
  return table[id.toLowerCase()] ?? null;
}

const copy = <T extends object>(rows: T[]): T[] => rows.map((row) => ({ ...row }));

export function sampleResident(id: string): Resident | null {
  const resident = byId(residents, id);
  return resident ? { ...resident, tiles: copy(resident.tiles) } : null;
}

export function sampleStory(id: string): StoryChapter[] | null {
  const rows = byId(chapters, id);
  return rows ? copy(rows) : null;
}

export function sampleProfile(id: string): ResidentProfile | null {
  const row = byId(profiles, id);
  if (!row) return null;
  return {
    ...row,
    summary: row.summary ? { ...row.summary } : null,
    communication: copy(row.communication),
    routines: copy(row.routines),
    likes: copy(row.likes),
    dislikes: copy(row.dislikes),
    context: copy(row.context),
    observations: copy(row.observations),
    pending: copy(row.pending),
  };
}

export function homeFor(id: string): string {
  return byId(profiles, id)?.home ?? "Home";
}

export function sampleEssentials(id: string): Highlight[] {
  const profile = sampleProfile(id);
  if (!profile) return [];
  return [...profile.likes, ...profile.dislikes].slice(0, 4);
}

export function sampleRoutines(id: string): Highlight[] {
  return sampleProfile(id)?.routines ?? [];
}

/** Keyword match over the sample answers. Null means "not on file". */
export function sampleCoachAnswer(id: string, question: string): CoachAnswer | null {
  const entries = byId(coach, id);
  if (!entries) return null;
  const words = new Set(
    question
      .toLowerCase()
      .replace(/[^a-z0-9'\- ]/g, " ")
      .split(/\s+/)
      .map((word) => word.replace(/'s$/, ""))
      .filter(Boolean),
  );
  let best: { score: number; entry: CoachEntry } | null = null;
  for (const entry of entries) {
    const score = entry.keywords.filter((keyword) => words.has(keyword)).length;
    if (score > 0 && (!best || score > best.score)) best = { score, entry };
  }
  if (!best) return null;
  return {
    answer: best.entry.answer.answer,
    sources: best.entry.answer.sources.map((source) => ({ ...source })),
  };
}

export function suggestedQuestions(id: string): string[] {
  return [...(byId(coachQuestions, id) ?? [])];
}

export function samplePending(id: string): PendingMemory[] | null {
  const rows = byId(pending, id);
  return rows ? copy(rows) : null;
}

export function sampleHandoff(id: string): HandoffItem[] | null {
  const rows = byId(handoff, id);
  return rows ? copy(rows) : null;
}

export function sampleActivity(id: string): ActivityItem[] | null {
  const rows = byId(activity, id);
  return rows ? copy(rows) : null;
}

export function sampleChoice(id: string): ChoicePreview | null {
  const row = byId(choices, id);
  return row ? { ...row, options: copy(row.options) } : null;
}

export function openingLine(id: string): Highlight | null {
  const summary = byId(profiles, id)?.summary;
  return summary ? { ...summary } : null;
}

/** Kept for callers from main: the sample Coach answers as a list. */
export function sampleCoach(id: string): (CoachAnswer & { question: string })[] {
  return suggestedQuestions(id).flatMap((question) => {
    const answer = sampleCoachAnswer(id, question);
    return answer ? [{ question, ...answer }] : [];
  });
}

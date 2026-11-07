export type Task = {
  id: string;
  title: string;
  hours: string;
  doneWhen: string;
  now?: boolean;
};

export type Owner = {
  name: string;
  role: string;
  tasks: Task[];
};

/**
 * One card per task id in BUILD_PLAN §7, using the staff-experience split
 * (the schedule in §8). The older frontend-lead list later in that section
 * repeats these ids and is not a second set of cards.
 */
export const OWNERS: Owner[] = [
  {
    name: "James",
    role: "Voice",
    tasks: [
      {
        id: "T1.1",
        title: "ElevenLabs setup and resident voices",
        hours: "Hour 0–1",
        doneWhen: "6 voices exist, each with a preview clip.",
        now: true,
      },
      {
        id: "T1.2",
        title: "Speak service",
        hours: "Hours 1–4",
        doneWhen: "An approved sentence plays in under 2 seconds. A repeat plays instantly.",
      },
      {
        id: "T1.3",
        title: "Wire speech into Speak For Me",
        hours: "Hours 4–6",
        doneWhen: "Milestone 1: tiles, suggestions, approve, spoken.",
      },
      {
        id: "T1.4",
        title: "Story interview agent",
        hours: "Hours 6–10",
        doneWhen: "One chapter is interviewed with taps only, and the draft is read back.",
      },
      {
        id: "T1.5",
        title: "Chapter narration",
        hours: "Hours 10–12",
        doneWhen: "Milestone 2: the story page plays in the resident's voice.",
      },
      {
        id: "T1.6",
        title: "Coach voice mode",
        hours: "Hours 12–14",
        doneWhen: "Staff can ask out loud and hear a sourced answer.",
      },
      {
        id: "T1.7",
        title: "Spoken approvals and confirmations",
        hours: "Hours 14–16",
        doneWhen: "Every approval card and confirmation can be heard.",
      },
      {
        id: "T1.8",
        title: "Polish and demo audio",
        hours: "Hours 16–24",
        doneWhen: "The demo runs with no waiting on audio.",
      },
    ],
  },
  {
    name: "Tiffany",
    role: "Data and MCP",
    tasks: [
      {
        id: "T2.1",
        title: "Repo, database, and mocks",
        hours: "Hour 0–1",
        doneWhen: "Everyone can call every endpoint and get mock data.",
        now: true,
      },
      {
        id: "T2.2",
        title: "Seed data and binder import",
        hours: "Hours 1–3",
        doneWhen: "Reset runs in under a minute. Binder facts are labelled From records.",
      },
      {
        id: "T2.3",
        title: "Resident-profile MCP server",
        hours: "Hours 3–6",
        doneWhen: "All tools return the right data for Marcus and Dana.",
      },
      {
        id: "T2.4",
        title: "Real routes and EMH mock",
        hours: "Hours 6–12",
        doneWhen: "Milestone 2 data paths are real, not mocked.",
      },
      {
        id: "T2.5",
        title: "Memory MCP server",
        hours: "Hours 12–14",
        doneWhen: "Recall for drinks returns coffee and tea, each with a status.",
      },
      {
        id: "T2.6",
        title: "Actions MCP server",
        hours: "Hours 14–16",
        doneWhen: "Approving a plan books, calendars, emails, and creates a staff task.",
      },
      {
        id: "T2.7",
        title: "Handoff agent",
        hours: "Hour 16",
        doneWhen: "Jordan's handoff matches the seeded data.",
      },
      {
        id: "T2.8",
        title: "Freeze, deploy, document",
        hours: "Hours 16–24",
        doneWhen: "A fresh clone plus the README gets the app running.",
      },
    ],
  },
  {
    name: "Ahmed",
    role: "Resident experience",
    tasks: [
      {
        id: "T3.1",
        title: "Gemini wrapper",
        hours: "Hour 0–1",
        doneWhen: "The wrapper returns valid JSON for a test schema.",
      },
      {
        id: "T3.2",
        title: "Voice agent",
        hours: "Hours 1–5",
        doneWhen: "Suggestions are personal and faithful on 15 of 15 tests.",
        now: true,
      },
      {
        id: "T3.3",
        title: "Speak For Me screen",
        hours: "Hours 4–6",
        doneWhen: "Milestone 1 works on this screen, end to end.",
      },
      {
        id: "T3.4",
        title: "Photo choice grid and questions",
        hours: "Hours 6–7",
        doneWhen: "The Story agent can open the grid and receive the tapped label.",
      },
      {
        id: "T3.5",
        title: "Story writer and story pages",
        hours: "Hours 7–9",
        doneWhen: "A draft uses only interview answers and can be played back.",
      },
      {
        id: "T3.6",
        title: "Choice agent and choice screen",
        hours: "Hours 12–14",
        doneWhen: "Consequences are correct and neutral. The flow is clickable.",
      },
      {
        id: "T3.7",
        title: "Approval card, confirm, voice picker",
        hours: "Hours 14–16",
        doneWhen: "The full resident demo is clickable end to end.",
      },
      {
        id: "T3.8",
        title: "Accessibility pass and pitch",
        hours: "Hours 16–24",
        doneWhen: "Someone outside the team can use the resident screens. Deck, video, Devpost, and URL are done.",
      },
    ],
  },
  {
    name: "William",
    role: "Staff experience",
    tasks: [
      {
        id: "T4.1",
        title: "App setup, design system, task board",
        hours: "Hour 0–1",
        doneWhen: "The app runs and shows mock data.",
      },
      {
        id: "T4.2",
        title: "Cloudinary pipeline and binder prompt",
        hours: "Hours 1–3",
        doneWhen: "Messy phone photos come out as matching tiles. Binder facts land as From records.",
        now: true,
      },
      {
        id: "T4.3",
        title: "Shared components and staff shell",
        hours: "Hours 3–6",
        doneWhen: "Ahmed can build on the shared components. The staff shell navigates.",
      },
      {
        id: "T4.4",
        title: "Coach, chat, and onboarding",
        hours: "Hours 6–10",
        doneWhen: "15 of 15 questions have the right source labels. A new staff member can finish Essentials.",
      },
      {
        id: "T4.5",
        title: "Handoff screen and observations",
        hours: "Hours 10–12",
        doneWhen: "Jordan's handoff renders. Observations save.",
      },
      {
        id: "T4.6",
        title: "Memory subagents",
        hours: "Hours 12–18",
        doneWhen: "The tea pattern shows up for Marcus to confirm, and the old coffee fact is flagged.",
      },
      {
        id: "T4.7",
        title: "Action agent and activity log",
        hours: "Hours 16–18",
        doneWhen: "5 of 5 goals split into online actions and staff tasks. The demo flow is clickable.",
      },
      {
        id: "T4.8",
        title: "Judge answers and polish",
        hours: "Hours 18–24",
        doneWhen: "AI-safety answers are rehearsed. Staff screens stay stable through both rehearsals.",
      },
    ],
  },
];

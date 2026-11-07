# In My Words

*Your story, told once, in your own voice. Your choices, made by you.*

An AAC (augmentative and alternative communication) + life-story + staff-onboarding app for non-verbal residents in supported living homes. Built in 24 hours for **CommuniHacks 2026** — KW Habilitation: Communication Profile App (Problem 11).

## What it does

- **Speak For Me** — tap photo tiles, AI suggests 2–3 full sentences from the resident's own life, resident approves, it's spoken in a voice they chose. Nothing is spoken without approval.
- **My Story** — picture-based interview builds life-story chapters, narrated in the resident's voice. Told once, heard by everyone.
- **Onboarding Coach** — new staff learn a resident's essentials in 2 minutes, full story in 10. Every answer is source-labelled: "In Marcus's words", "Staff observation, date", or "From EMH".
- **Memory Layer** — learns preferences, events and routines from every interaction. Inferred patterns are labelled "pattern noticed" until the resident confirms them.
- **Shift Handoff, Supported Choice, Actions** — since-last-shift summaries, photo-based choices with consequences, and agents that book/message/schedule — always behind a picture approval card.

## Repo layout

```
web/           Next.js app (Teammate 4)
api/           FastAPI backend + agents (Teammate 2 routes, Teammate 3 agents)
mcp/           4 MCP servers: profile, memory, actions, emh-mock (Teammate 2)
db/            Tiger Data schema, seed data, reset script (Teammate 2)
mock-booking/  Mock booking page for the demo (Teammate 2)
docs/          Project plan, build plan, contracts, demo script
```

## Getting started

1. **Clone and get on a branch** (main always demos — never commit straight to main):
   ```bash
   git clone https://github.com/Chuckyecheesy/InMyWords.git
   cd InMyWords
   git checkout -b t<your-number>/<task>   # e.g. t3/voice-agent
   ```
2. **Environment**: copy `.env.example` to `.env`; get real values from team chat. Never commit `.env`.
3. **Find your tasks**: [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) §7 lists every task by person (T1.x–T4.x) with hours and done-criteria. [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) has the feature specs, agent table, and data model.
4. **Respect the contracts**: API endpoints are frozen at hour 1 (BUILD_PLAN §6). Mock responses exist for everything so nobody waits on anybody.

### Per-area setup

| Area | First steps |
|---|---|
| `web/` | `cd web && npm install && npm run dev` (once scaffolded, T4.1) |
| `api/` | `cd api && pip install -r requirements.txt && uvicorn main:app --reload` (T2.1) |
| `mcp/` | Each server runs standalone via FastMCP over HTTP (T2.3+) |
| `db/` | Run `schema.sql` against Tiger Data, then the seed/reset script (T2.1–T2.2) |

## Working agreements

- **Mock first** — every endpoint has a hard-coded response from hour 1.
- **Main always demos** — branch, merge only when it runs, test the demo flow after every merge.
- **Stand-ups** at hours 3, 6, 9, 12, 15, 18, 21: done / next / blocked.
- **Milestones**: hour 6 (tiles→suggest→approve→spoken), hour 12 (story chapter + sourced Coach answers), hour 16 (handoff, choice, memory, first actions), **hour 18 feature freeze**, hour 23 submission.
- **Product guardrails** are in [CLAUDE.md](CLAUDE.md) — approval before anything is spoken or acted on, source labels on every fact, no "staff decided", agents only reach data through MCP.

## Team

| | Role | Owns |
|---|---|---|
| Teammate 1 | Voice lead | ElevenLabs voices, TTS, Story interview agent, Coach voice mode, demo audio |
| Teammate 2 | Data & MCP lead | Tiger Data, seed data, all 4 MCP servers, backend API, Handoff agent |
| Teammate 3 | Resident experience lead | Prompts + screens for Speak For Me, My Story, Supported Choice; approval card, voice picker; accessibility; Gemini wrapper |
| Teammate 4 | Staff experience & pitch lead | Prompts + screens for Coach, memory + binder import, actions, Handoff; app shell, design system, Cloudinary; deck, video, Devpost |

## Demo personas (fictional)

- **Marcus, 34** — single words and gestures. Raptors, Saturday bowling, double-double from Tim's. Loud rooms upset him.
- **Dana, 52** — more independent, weekly budget with support, picture tiles. Gardening; sister visits Sundays.

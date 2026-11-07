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
web/           Next.js app (William: shell, design system, staff routes · Ahmed: resident routes)
api/           FastAPI backend + agents (Tiffany: routes · Ahmed: voice/story/choice agents · William: coach/action/memory agents)
mcp/           4 MCP servers: profile, memory, actions, emh-mock (Tiffany)
db/            Tiger Data schema, seed data, reset script (Tiffany)
mock-booking/  Mock booking page for the demo (Tiffany)
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

### Run the full stack

```bash
pip install -r api/requirements.txt -r mcp/requirements.txt

# four MCP servers (each in its own terminal, from mcp/)
cd mcp && python profile_server.py     # :8101
cd mcp && python memory_server.py      # :8102
cd mcp && python actions_server.py     # :8103
cd mcp && python emh_server.py         # :8104

cd api && uvicorn main:app --reload    # :8000  backend (works alone too — mock fallback)
cd mock-booking && python app.py       # :8200  demo booking page
cd web && npm install && npm run dev   # :3000  the app
```

Everything works **without** `DATABASE_URL` (seed-JSON fallback) and switches to Tiger Data automatically when it's set. Verify the whole contract: start the stack, then `python api/tests/smoke_api.py` — all 19 endpoints must pass. Reset demo data: `python db/reset.py`.

Architecture diagram: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Working agreements

- **Mock first** — every endpoint has a hard-coded response from hour 1.
- **Main always demos** — branch, merge only when it runs, test the demo flow after every merge.
- **Stand-ups** at hours 3, 6, 9, 12, 15, 18, 21: done / next / blocked.
- **Milestones**: hour 6 (tiles→suggest→approve→spoken), hour 12 (story chapter + sourced Coach answers), hour 16 (handoff, choice, memory, first actions), **hour 18 feature freeze**, hour 23 submission.
- **Product guardrails** are in [CLAUDE.md](CLAUDE.md) — approval before anything is spoken or acted on, source labels on every fact, no "staff decided", agents only reach data through MCP.

## Team

| | Role | Owns |
|---|---|---|
| James (T1) | Voice lead | ElevenLabs voices, TTS, Story interview agent, Coach voice mode, demo audio |
| Tiffany (T2) | Data & MCP lead | Tiger Data, seed data, all 4 MCP servers, backend API, Handoff agent |
| Ahmed (T3) | Resident experience lead & pitch lead | Prompts + screens for Speak For Me, My Story, Supported Choice; approval card, voice picker; accessibility; Gemini wrapper; deck, demo video, Devpost, domain |
| William (T4) | Staff experience lead | Prompts + screens for Coach, memory + binder import, actions, Handoff; app shell, design system, Cloudinary; judge AI-safety answers |

## Demo personas (fictional)

- **Marcus, 34** — single words and gestures. Raptors, Saturday bowling, double-double from Tim's. Loud rooms upset him.
- **Dana, 52** — more independent, weekly budget with support, picture tiles. Gardening; sister visits Sundays.

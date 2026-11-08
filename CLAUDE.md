# In My Words

AAC + life-story + staff-onboarding app for non-verbal residents in supported living homes.
Built in 24 hours for CommuniHacks 2026 (KW Habilitation, Problem 11).

> Pitch: *Your story, told once, in your own voice. Your choices, made by you.*

Full specs live in `docs/`: [PROJECT_PLAN.md](docs/PROJECT_PLAN.md) (features, agents, data model, demo script), [BUILD_PLAN.md](docs/BUILD_PLAN.md) (tasks, schedule, API contracts), and [GAZE_GESTURE_PLAN.md](docs/GAZE_GESTURE_PLAN.md) (eye-gaze + gesture input addition, tasks G1–G8). Read the relevant section before building anything.

## Non-negotiable product rules

These are guardrails, not preferences. Never write code that violates them:

1. **Nothing is spoken, saved as the resident's words, or acted on without the resident's approval.**
2. **Every fact carries a source label**: `resident` ("In Marcus's words"), `staff` (with date), `emh`, `document` ("From records, 2019" — imported binder facts, the base profile layer), or `inferred` ("pattern noticed"). Inferred and imported facts are never shown as the resident's words until the resident confirms them.
3. **Choices belong to the resident**: outcomes are `chosen` or `not_yet_decided`. There is no "staff decided".
4. **Agents never touch the database directly** — all data access goes through the four MCP servers.
5. **Actions require an approval card first**, run only from an allowlist, show costs, respect spending limits, and log everything.
6. **Budget/cost math is plain code, never the LLM.** The LLM only phrases results.
7. **Camera (gaze/gesture input) only with consent** — off by default, one-tap off, visible on-indicator. Video is processed on-device only, never stored or sent; only outcome events (select/approve/cancel) reach the backend. Inferred intent never triggers an action directly — every gaze/gesture selection still goes through confirmation. The input profile is labelled "from input history", never as the resident's words.

## Repo structure & ownership

| Path | Owner | What it is |
|---|---|---|
| `web/` | William (shell, design system, staff routes), Ahmed (resident routes) | Next.js + React + TypeScript app, tablet-first. All backend calls go through `web/lib/api.ts`. |
| `api/` | Tiffany (routes); `agents/` split: Ahmed (voice, story, choice), William (coach, action, memory) | FastAPI backend. Routes in `main.py`; agents in `agents/`; `services/` has `gemini.py` (Ahmed), `elevenlabs.py` (James), `cloudinary.py`, `mcp_client.py`. |
| `mcp/` | Tiffany | Four FastMCP servers over streamable HTTP: `profile_server`, `memory_server`, `actions_server`, `emh_server` (mock). |
| `db/` | Tiffany | Tiger Data (Postgres + vector) `schema.sql`, `seed/`, reset script. |
| `mock-booking/` | Tiffany | Tiny page listing bookings so the demo can show a booking landed. |
| `docs/` | Everyone | Plans, contracts, architecture diagram, demo script. |

Team roles: **T1 = James, Voice lead** (ElevenLabs, everything heard), **T2 = Tiffany, Data/MCP lead** (DB, MCP servers, backend routes, Handoff), **T3 = Ahmed, Resident experience & pitch lead** (prompts + screens for Speak For Me, My Story, Choice; approval card, voice picker, accessibility; Gemini wrapper; deck/video/Devpost/domain), **T4 = William, Staff experience lead** (prompts + screens for Coach, memory + binder import, actions, Handoff; app shell, design system, Cloudinary; judge AI-safety answers).

## Tech stack

- **Frontend**: Next.js, React, TypeScript
- **Gaze/gesture input**: WebGazer (eye tracking) + MediaPipe Gesture Recognizer — **client-side dynamic imports only** (both touch `window`; SSR crashes), **one shared camera stream** (MediaPipe reads WebGazer's video element). Events land in a Tiger Data hypertable (`input_events`) with a daily continuous aggregate.
- **Backend + MCP**: Python, FastAPI, FastMCP (streamable HTTP)
- **LLM**: Gemini Flash with structured JSON output; Gemini embeddings (vector size fixed at setup — never change it)
- **Voice**: ElevenLabs (Voice Design, low-latency TTS cached by `voice_id + text`, Agents for Story interview & Coach voice mode)
- **DB**: Tiger Data (Postgres with vector search)
- **Media**: Cloudinary (one tile transformation recipe, chosen hour 1)
- Messaging action = email (not SMS). Booking action = our own `mock-booking` page.

## Build principles (hackathon workflow)

- **Mock first.** Every endpoint returns hard-coded mock JSON from hour 1; real logic replaces mocks one by one so nobody blocks anybody.
- **Contracts frozen at hour 1.** The API table in `docs/BUILD_PLAN.md` §6 is the contract. Changing any input/output needs a heads-up in team chat first.
- **Main always demos.** Work on branches (`t1/...`, `t2/...`, `t3/...`, `t4/...`), merge only when it runs, test the demo flow after every merge.
- **Demo data resets with one command** (`db/` reset script).
- **Feature freeze at hour 18.** After that: bug fixes and pre-approved stretch only. Cut order is in PROJECT_PLAN §12; never cut Speak For Me, My Story, Onboarding Coach, or the minimal Memory Layer.

## Environment

Copy `.env.example` to `.env` and fill in real values (shared privately in team chat — never commit `.env`).

## Accessibility (resident-facing screens)

Tap targets ≥ 64px, body text ≥ 22px, same layout everywhere, real photos over icons, long-press speaks any button label, no time limits, high-contrast mode, undo for every action, one question at a time, calm visuals.

## Latency targets

Tiles → suggestions: < 3s. Approve → audio playing: < 2s (instant if cached). Coach answer: < 4s. If slower, show a friendly "thinking" state with tiles still visible.

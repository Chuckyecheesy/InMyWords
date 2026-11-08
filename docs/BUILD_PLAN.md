# In My Words — Build Plan

CommuniHacks 2026 | KW Habilitation: Communication Profile App (Problem 11)

Companion to the [Project Plan](PROJECT_PLAN.md). This doc is the step-by-step build: setup, structure, specs, and every task for each teammate.

> **Added Nov 8:** the eye-gaze + gesture input layer has its own build plan with tasks **G1–G8**, contracts, data model and demo beat — see [GAZE_GESTURE_PLAN.md](GAZE_GESTURE_PLAN.md). Summary of what it touches per area: `web/lib/input/*` + calibration/consent/grid components (frontend), `POST /input-events` + `GET /input-profile` (backend), `log_input_event`/`get_input_profile` on the memory server, and an `input_events` hypertable + daily continuous aggregate + seed history in `db/` (T2). Cut order G8 → G6 → G7; G1–G5 are the core.

*(Markdown version of* `In_My_Words_Build_Plan.docx` *— the docx is the original; keep both in sync if either changes.)*

## 1. Build principles

- **Mock first.** Every endpoint returns a hard-coded mock response by hour 1. Real logic replaces mocks one by one, so nobody waits on anybody.
- **Contracts are frozen at hour 1.** Changing an input or output after that needs a 1-minute heads-up in the team chat.
- **Main always demos.** Work on branches, merge only when it runs. Test the demo flow after every merge.
- **Agents never touch the database directly.** All data goes through the MCP servers.
- **Resident approval** before anything is spoken, saved as their words, or acted on.
- **Demo data can be reset with one command.**

## 2. Hour 0 setup checklist

| Item | Owner | Notes |
|---|---|---|
| GitHub repo + folder structure (§3) | T2 | Add everyone as collaborators. Protect main. |
| Team chat channel + task board | T4 | One card per task ID in §7. |
| Tiger Data service | T2 | Free tier. Enable vector extension. Share connection string privately. |
| Gemini API key | T3 | From Google AI Studio. |
| ElevenLabs account + participant credits | T1 | Claim the all-participants ElevenLabs credits. |
| Cloudinary account | T4 | Create an upload preset for staff photos. |
| Hosting | T2 (backend), T4 (web) | Web on Vercel. Backend on Render, Railway or a Vultr VM. |
| Entire | Everyone | Run coding agent sessions through Entire for the Entire track. |
| GoDaddy Registry domain | T3 | Register early (e.g. inmywords.xyz). Point it at the web app later. |
| Shared environment variables | T2 | `.env.example` in the repo, real values shared privately (§2.1). |

### 2.1 Environment variables

See [`.env.example`](../.env.example): `DATABASE_URL`, `GEMINI_API_KEY`, `ELEVENLABS_ID` + agent IDs, Cloudinary keys + upload preset, `API_BASE_URL`, the four `MCP_*_URL`s, `EMAIL_SENDER` credentials for send_message, and `GOOGLE_SERVICE_ACCOUNT_JSON` + `GOOGLE_CALENDAR_STAFF_EMAILS` for the planner's Google Calendar MCP (.zip calendar-export upload fallback if unavailable).

## 3. Repo structure

```
/web            (T4: shell, design system, staff routes · T3: resident routes) Next.js app
  app/resident/[id]           home tile grid
  app/resident/[id]/planner, /choice, /confirm, /voice
  app/staff                   pick a resident
  app/staff/[id]/onboarding, /coach
  app/staff/handoff, /activity
  app/manager                 (stretch)
  components/, lib/api.ts     all backend calls in one place
/api            (T2 owns routes; agents/ split: T3 voice/planner/choice · T4 coach/action/memory)
  main.py                     FastAPI app and routes
  agents/                     voice.py, coach.py, planner.py, choice.py, action.py,
                              handoff.py, memory/ (observer, consolidator, routines, retriever)
  services/                   gemini.py, elevenlabs.py (T1), cloudinary.py, mcp_client.py
  tests/                      test sets and evaluation script
/mcp            (T2) profile_server, memory_server, actions_server, emh_server
/db             (T2) schema.sql, seed/ (marcus.json, dana.json, emh_notes.json,
                     memories.json), reset script
/mock-booking   (T2) tiny page listing bookings
/docs           architecture diagram, README, demo script
```

## 4. Technical decisions

| Decision | Choice | Why |
|---|---|---|
| MCP server framework | Python FastMCP over streamable HTTP | Fast to write. HTTP lets the backend and Claude Desktop connect to the same server. |
| How ElevenLabs agents reach data | Webhook tools that call our backend; backend calls MCP | One place for auth and logging. Easier to debug than direct MCP access. |
| LLM | Gemini Flash with structured JSON output | Fast enough for interactive use. Structured output means no parsing failures. |
| Embeddings | Gemini embedding model | Same provider, one key. Fix the vector size at setup and never change it. |
| Memory search | Vector similarity + keyword match + recency, in Tiger Data | One database for memories, timestamps and search. |
| Messaging action | Email, not SMS | No phone number verification needed. SMS is a stretch. |
| Booking action | Our own mock booking page | Real booking sites are unreliable to automate live. |
| TTS | ElevenLabs low-latency model, cached by voice + text | Repeated phrases play instantly; saves credits. |
| Budget and cost maths | Plain code, not the LLM | LLMs get arithmetic wrong. The agent only phrases the result. |
| Routine detection | SQL grouping by weekday and hour, then Gemini phrases it | Patterns from data, not guesses. |
| Planner / staff visits | **Google Calendar MCP** server the Planner subagent calls; dual-write to `visit_events` | The resident's typed routine (e.g. 1:00pm, 2h, daily) expands — in plain code, not the LLM — into `visit_events` (source of truth), which the subagent books on staff's Google Calendar via MCP. **Fallback if the MCP is down**: import a Google Calendar export once and render its events on the same weekly grid — identical UI. Only resident-approved visits reach Google; never notes, reasons or health info. |
| Calendar action (stretch) | Per-resident **Google Calendar**, dual-write | `calendar_events` in Tiger Data stays the source of truth; Google is a synced view. It's *the resident's* calendar — agent writes only resident-approved events, staff subscribe as readers. Real integration with zero contract changes (`add_to_calendar` input/output unchanged), and it drops cleanly if time runs out. |
| Base profile layer | Import existing binder/record documents once at seed time (Gemini document understanding) | The binder gets read once — by the system. Extracted facts enter the memory store with `source = document` ("From records, 2019"), never shown as the resident's words, first in line for "Is this still true?" confirmation. Directly answers the problem statement and replaces hand-written seed JSON with a real capability. Staff upload UI is stretch. |
| Gaze input | WebGazer, client-side dynamic import only | Browser + webcam, no special hardware; touches `window` so SSR must be disabled. 2×3 big-tile grid — webcam gaze resolves regions, not points. |
| Gesture input | MediaPipe Gesture Recognizer (tasks-vision), VIDEO mode, 1 hand, reading WebGazer's shared video element | Thumb_Up/Open_Palm out of the box; one camera stream avoids conflicts. OpenCV evaluated and rejected (server video breaks the privacy story). |
| Input telemetry | Outcome events only, batched every 2s → `input_events` hypertable + daily continuous aggregate | Never video, never raw gaze samples. High-frequency timestamped events are the Tiger Data textbook case; profile maths is plain code over the aggregate. |

### Latency targets

- Tiles to suggestions on screen: **under 3 seconds**.
- Approve to audio playing: **under 2 seconds** (instant if cached).
- Coach answer: **under 4 seconds**.
- If a step is slower, show a friendly "thinking" state with the resident's tiles still visible.

### Cost

Everything fits in free tiers plus participant credits for a 24-hour build. Biggest spend is ElevenLabs voice/agent minutes — cache all repeated audio and pre-generate demo lines. Turn off any paid VM when not testing.

## 5. Database tables (Tiger Data)

| Table | Fields |
|---|---|
| homes | id, name, manager_id |
| residents | id, home_id, first_name, voice_id, communication_style, weekly_budget |
| staff | id, name, role (staff \| manager), last_shift_end |
| tiles | id, resident_id, label, category, cloudinary_id, times_used |
| routines | id, resident_id, person (staff_id), start_time, length_min, days (default all 7), source, created_at |
| visit_events | id, resident_id, staff_id, starts_at, ends_at, source (resident \| staff \| inferred), google_event_id, approved, status (pending \| accepted \| rejected), responded_by, responded_at, created_at |
| sentences | id, resident_id, tiles, options, chosen_text, approved, created_at |
| choices | id, resident_id, question, options (label, photo, cost), chosen, status (chosen \| not_yet_decided), created_at |
| memories | id, resident_id, type (preference \| event \| routine), content, embedding, source (resident \| staff \| emh \| document \| inferred), source_date, times_seen, first_seen, last_seen, status (confirmed \| pending \| dismissed) |
| observations | id, resident_id, staff_id, note, created_at |
| action_plans | id, resident_id, goal, steps, total_cost, status (proposed \| approved \| cancelled \| done), created_at |
| action_results | id, plan_id, step, result, created_at |
| staff_tasks | id, resident_id, task, due_at, status (open \| done) |
| calendar_events | id, resident_id, title, starts_at |
| bookings | id, resident_id, activity, starts_at (mock booking site reads this) |
| emh_notes | id, resident_id, author, note, created_at (mock) |
| emh_checklist | id, home_id, date, item, happened, reason (mock) |
| emh_events | id, resident_id, event, created_at (mock) |

The "profile" is a **view over memories where status = confirmed**, grouped by section.

## 6. Backend API (contracts frozen at hour 1)

See [CONTRACTS.md](CONTRACTS.md) for the full endpoint table with inputs, outputs and owners.

## 7. Tasks by person

Task IDs match cards on the task board. Do them in order unless marked parallel.

### James (T1): Voice lead

You own everything the user hears: resident voices, the spoken planner/approval cards, the Coach voice mode, spoken confirmations, and demo audio.

**T1.1 — ElevenLabs setup and resident voices (hour 0–1)**

- Create the account, claim participant credits, create an API key.
- Voice Design: 3 voices for Marcus (warm, calm, mid-30s, Canadian) and 3 for Dana (friendly, gentle, early 50s).
- One short preview line per voice ("Hi, I'm Marcus. I like bowling on Saturdays.").
- Save all 6 voice IDs and preview audio. Send voice IDs to T2 for seed data.
- ✅ Done when: 6 voices exist with preview clips.

**T1.2 — Speak service (hours 1–4)**

- Build `POST /speak`: look up the resident's voice_id, generate audio with the low-latency TTS model, return a URL.
- Cache by voice_id + text — same request returns the cached file instantly.
- Store audio in Cloudinary (raw/video resource) or backend storage. Return a public URL.
- Add a "speak tiles only" path: just the tile words, no AI.
- ✅ Done when: approved sentence plays in under 2 seconds; a repeated sentence plays instantly.

**T1.3 — Wire speech into Speak For Me (hours 4–6)**

- With T4: when the resident taps ✅, call `/speak` and play the audio.
- Long-press on any button speaks its label (pre-generate these labels).
- ✅ Done when: **Milestone 1** — tiles → suggestions → approve → spoken, end to end.

**T1.4 — Spoken planner proposals (hours 6–10)**

- When the Planner subagent proposes visit times, speak the one-sentence summary in the resident's voice: "Meet staff at 1:00, finish by 3:00, every day. Is that right?" with yes/no tiles.
- Client tool `show_choices(question, options)`: rendered by T4's PhotoChoiceGrid; returns the tapped label (reused for picking a person/day).
- Pre-generate the common planner phrases (times on the hour/half-hour, "every day", day names) so readback is instant.
- ✅ Done when: a routine proposed by the subagent is read aloud and approved by tap.

**T1.5 — Planner booking confirmation (hours 10–12)**

- After the resident approves, speak the booked confirmation ("Done. You'll see staff at 1:00 every day.") once `POST /planner/book` returns.
- Pre-generate confirmation audio for the seeded routines for Marcus and Dana.
- ✅ Done when: **Milestone 2** — a routine set by taps books a staff visit and the confirmation plays in the resident's voice.

**T1.6 — Coach voice mode (hours 12–14)**

- ElevenLabs Agent "Onboarding Coach", neutral staff-facing voice.
- Webhook tool `ask_about(resident_id, question)` → `POST /coach/ask`. Agent reads the answer and says the source ("Marcus told us...", "A staff note from March 3 says...").
- Prompt rule: never answer from its own knowledge; if the tool says unknown, say "I don't know, it's best to ask Marcus."
- ✅ Done when: staff can ask out loud and hear a sourced answer.

**T1.7 — Spoken approvals and confirmations (hours 14–16)**

- Approval cards: speak a one-sentence summary ("Book bowling Saturday at 2pm, $15. Text Lisa.").
- Memory confirmations: "Do you like tea now?" with yes/no tiles.
- Handoff readout for staff (optional, neutral voice).
- ✅ Done when: every approval card and confirmation can be heard.

**T1.8 — Polish and demo audio (hours 16–24)**

- Measure latency for each audio step; fix anything over target.
- Pre-generate every line in the demo script.
- Lead two rehearsals. Record voice-over for the backup video. Present the live demo.
- ✅ Done when: demo runs with zero audio waits.

**Dependencies**: from T2 — /planner/book and /coach/ask (mock by hour 1). From T3 — planner routine fields and PhotoChoiceGrid (hour 7), /planner/plan (hour 9), voice picker screen (hour 16). From T4 — Coach answer format (hour 8), Coach chat embed.

### Tiffany (T2): Data and MCP lead

You own the database, seed data, all four MCP servers, the backend routes, mock services and the Handoff agent.

**T2.1 — Repo, database and mocks (hour 0–1)**

- Create the repo with the structure in §3 and `.env.example`.
- Create the Tiger Data service, enable vector search, run schema.sql (§5).
- Stand up FastAPI with every endpoint in §6 returning hard-coded mock JSON. Deploy it so others can call it.
- ✅ Done when: T1, T3 and T4 can call every endpoint and get mock data.

**T2.2 — Seed data (hours 1–3)**

- Marcus: 12 tiles (coffee, tea, bowling, Raptors, park, music, bus, quiet, Lisa, help, yes, no); a seeded routine + its visit_events; preferences (double-double, quiet spaces, bowling Saturdays, live basketball goal).
- Dana: 12 tiles (garden, sister, groceries, tea, walk, money, TV, help, yes, no, etc.); a seeded routine (meet staff 1:00p.m., 2h, daily → 1:00p.m.–3:00p.m. visit_events for 7 days from Nov 8, 2026); weekly budget $60.
- 2 weeks of EMH notes, checklist entries with reasons ("grocery shopping: didn't happen, bus cancelled"), significant events.
- 2 weeks of memory history including a visible pattern: Marcus picked tea 5 times this week after months of coffee.
- 3 staff (one new staff "Jordan" with no prior shifts), 2 homes, 1 manager.
- **Binder import (base profile layer)**: write a 2–3 page fictional binder document for Marcus (dated a few years back — routines, likes, family contacts, "what helps"). The ingest script runs T4's extraction over it and saves each fact via the memory server's `remember` with `source = document` and the document's date. These seed most of Marcus's profile instead of hand-written JSON. Include at least one outdated fact (e.g. the binder says coffee; recent pattern says tea) so the "Is this still true?" / contradiction demo has material.
- Reset script that wipes and reloads everything, including re-running the binder import.
- ✅ Done when: reset runs in under a minute; all seeded content shows in the UI; Coach answers from binder facts labelled "From records" with the document date.

**T2.3 — resident-profile MCP server (hours 3–6)**

- Tools: get_profile, get_planner, save_routine, ask_about (retrieval only; T4's Coach does the wording), suggest_sentence (calls T3's Voice agent), log_sentence, log_choice, add_observation.
- Every returned fact includes source and date.
- Backend `mcp_client.py`: one function per tool, used by routes and agents.
- ✅ Done when: all tools return correct data for both residents.

**T2.4 — Replace mocks with real routes (hours 6–12)**

- Wire /residents, /sentences, /planner/routine, /planner/{id}, /observations, /choices/{id}/decide to the MCP servers.
- Build the emh mock server: get_contact_notes, get_checklist, get_significant_events.
- ✅ Done when: Milestone 2 data paths are real, not mocked.

**T2.5 — Memory MCP server (hours 12–14)**

- Tools: remember, recall(query, type), get_routines, propose_update, confirm_memory.
- recall: rank by vector similarity, boost keyword matches and recent last_seen; return status and source with each memory.
- Store embeddings using T3's embedding function. Fix the vector size at setup.
- Endpoints: GET /memories/pending, POST /memories/{id}/confirm.
- ✅ Done when: `recall("drinks")` for Marcus returns coffee and tea memories with status.

**T2.6 — Actions MCP server and mock services (hours 14–16)**

- Tools: plan_actions (calls T4's Action agent), send_message (real email), add_to_calendar, book_staff_visit (planner — via Google Calendar MCP, dual-writes visit_events), import_calendar (planner fallback — staff upload a .zip Google Calendar export (Google Takeout, `.ics` files inside); parse it onto the grid), book_activity (writes to bookings), next_bus (optional), create_staff_task.
- **Approval gate: action tools (incl. book_staff_visit) refuse to run unless the plan/visit status is approved.**
- Mock booking page at /mock-booking showing current bookings.
- Log every step to action_results.
- **Google Calendar MCP (planner path)** — the Planner subagent books staff visits through a Google Calendar MCP server; fallback is manual import:
  - One Google Cloud project + Calendar API + one service account; key goes in `.env` as `GOOGLE_SERVICE_ACCOUNT_JSON`. Staff demo accounts in `GOOGLE_CALENDAR_STAFF_EMAILS`. Pre-create the night before the demo.
  - `book_staff_visit` dual-writes: `visit_events` row first (source of truth), then creates the event on the **staff member's** Google Calendar (so staff see the visit where they already look), with an "approved by Dana" note. If the Google/MCP call fails, DB-only still demos — same grid.
  - *Nov 8 change:* the row starts `pending`; the Google write moves to `respond_to_visit` when staff **accept**. **Reject** sets `rejected` (row kept for the log, hidden on both grids) and deletes any Google event. See PROJECT_PLAN §2.5 "Staff accept or reject" and `POST /planner/respond` in CONTRACTS.md.
  - **Fallback if the MCP server doesn't work**: staff upload a one-time **.zip export of their Google Calendar** (Settings → Export in Google Calendar, or Google Takeout — the .zip holds `.ics` files per calendar); `import_calendar` unzips, parses the `.ics` events, and renders them on the planner grid. No live booking, identical UI.
  - Only resident-approved visits ever reach Google — never notes, reasons, or health info. Those stay in Tiger Data where Handoff needs them.
  - Recurrence is plain code: a 7-days-a-week routine expands to one visit_event per day; the LLM only phrases the proposal.
- **Stretch — staff calendar import (separate from the fallback above; this one writes live)**: a staff self-service tool that migrates an existing calendar into Google Calendar via a parse-and-insert pipeline, not the MCP wrapper:
  1. Unpack the uploaded `.zip` in a temp environment; detect `.ics` (or JSON/CSV) files.
  2. Parse each event's title, start/end, timezone and recurrence; normalize every timestamp to local time in plain code (never the LLM).
  3. `propose_calendar_import` returns the normalized list (with duplicate flags) for an approval card — staff review before anything is written.
  4. Once approved, `commit_calendar_import` loops through and calls Google Calendar's `events.insert` for each one, writing live.
  5. Checks for existing overlapping events first, so a re-import never double-books staff's real calendar.
- ✅ Done when: approving a routine books a recurring staff visit on the calendar (or renders imported visits), sends any real email and creates a staff task. (Stretch tool is separately done when a staff-uploaded .zip produces an approval card and, once approved, live events on Google Calendar.)

**T2.7 — Handoff agent (hour 16)**

- GET /handoff: collect since staff.last_shift_end: EMH notes, checklist misses with reasons, observations, new choices, staff tasks, confirmed memory changes.
- Gemini turns the list into short plain bullets. Facts only, every bullet keeps its date.
- ✅ Done when: Handoff for Jordan matches seeded data.

**T2.8 — Freeze, deploy, document (hours 16–24)**

- Feature freeze at 18. Test every endpoint. Deploy final backend.
- Stretch: connect the profile MCP server to Claude Desktop and record a clip.
- README: setup steps, env vars, architecture diagram. Reset demo data before judging.
- ✅ Done when: fresh clone + README gets the app running.

**Dependencies**: from T1 — voice IDs (hour 1). From T3 — Voice and Choice agent functions (hours 4–14), embedding function (hour 10). From T4 — binder extraction prompt (hour 2), Cloudinary IDs for tiles and photos (hour 3), Coach, memory and Action agent functions (hours 8–17).

### Ahmed (T3): Resident experience & pitch lead (AI + screens)

You own everything the resident directly uses — the prompts AND the screens: Speak For Me, My Planner, Supported Choice, approvals and confirmations. You are also accessibility lead, own the shared Gemini wrapper, and own the pitch: deck, demo video, Devpost, domain.

**T3.1 — Gemini wrapper (hour 0–1)**

- `services/gemini.py`: one function for structured JSON output (pass a schema, get validated JSON back), one for embeddings.
- Agree output shapes with T1, T2 and T4. Hand the wrapper to T4 (Coach, memory, actions) and T2.
- ✅ Done when: wrapper returns valid JSON for a test schema.

**T3.2 — Voice agent: sentence suggestions (hours 1–5)**

- Input: resident, tapped tiles, time of day, top memories from recall.
- Output: 2–3 sentences, each under 12 words, first person, only meaning what the tiles mean, personalised by memories.
- Rules: never add new wants; if unclear, include a short neutral option ("I want coffee.").
- Test with 15 tile combinations across both residents; record results in `tests/`.
- ✅ Done when: suggestions are personal ("double-double from Tim's") and faithful on 15/15 tests.

**T3.3 — Speak For Me screen (hours 4–6)**

- Built on T4's design system and shared tile/button components (ready by hour 3).
- Tile grid by category, sentence strip at the top, "Help me say it" button.
- Suggestion cards (tap to hear preview), large ✅ and ❌ buttons, "speak tiles only" button.
- Long-press any button to hear its label.
- ✅ Done when: **Milestone 1** — tiles → suggestions → approve → spoken, end to end.

**T3.4 — PhotoChoiceGrid + planner routine fields (hours 6–7)**

- PhotoChoiceGrid: a question plus 2–4 big photo tiles; reused by the planner to pick a staff person and days (hand to T1/T2 by hour 7).
- Define the routine-input fields: person (staff tiles), start time, length, days (default all 7).
- ✅ Done when: the grid returns the tapped label and the routine fields are agreed with T2.

**T3.5 — Planner subagent + My Planner screens (hours 7–9)**

- `POST /planner/plan`: expand a saved routine into proposed visit_events — **recurrence math in plain code**, Gemini only phrases the proposal. Ready by hour 9 for T1's readback.
- My Planner screens: routine-input screen, then a weekly grid (7 days) showing visit blocks (e.g. 1:00p.m.–3:00p.m.), with an approval card before booking.
- Planner subagent books via the Google Calendar MCP (T2's `book_staff_visit`); if that's down, a staff-uploaded .zip calendar export renders the same grid instead.
- Sleep hours 9–12; up for **Milestone 2**.
- ✅ Done when: a routine set by taps shows blocks on the weekly grid and an approved booking lands on the calendar.

**T3.6 — Choice agent + choice screen (hours 12–14)**

- `POST /choices`: input options (label, photo, cost). **Code calculates money left this week.** Gemini writes one short consequence line per option.
- Never recommends. Always includes "not decided yet".
- Choice screen: photo options with cost and "money left" line, plus "not decided yet".
- ✅ Done when: consequences are correct and neutral; choice flow is clickable end to end.

**T3.7 — Approval card, "confirm?" screen, voice picker (hours 14–16)**

- Action approval card: pictures for each step, total cost, approve and cancel; short cancel window after approval. Fed by T4's action plan format (agreed hour 13).
- "Pattern noticed, confirm?" screen with yes/no tiles.
- Voice picker: play 3 previews, choose one.
- ✅ Done when: full resident demo flow clickable end to end.

**T3.8 — Accessibility pass + pitch materials (hours 16–24)**

- Hours 16–18: check every resident screen: tap targets, contrast, no time limits, consistent layout, undo, labels spoken on long press. Test on a real tablet. Freeze at 18.
- Hours 18–20: pitch deck draft (6 slides): hook, what KW Habilitation told us, live demo, how it works, guardrails, what's next.
- Hour 20: record and edit the backup demo video (under 3 minutes) with James's voice-over; William supports on staff screens.
- Hours 20–24: final deck. Devpost write-up with sponsor categories. Point the GoDaddy domain at the web app.
- ✅ Done when: someone outside the team can use the resident screens with no explanation; deck, video, Devpost and live URL done by hour 23.

**Dependencies**: from T2 — mock endpoints (hour 1), profile/EMH data (hour 2). From T4 — design system + shared components (hour 3), action plan format for the approval card (hour 13). From T1 — /speak (hour 4), interview answer format (hour 7).

### William (T4): Staff experience lead (AI + screens)

You own everything staff use — the prompts AND the screens: Coach, memory intelligence, actions, Handoff. Plus the shared frontend foundation (app shell, design system, Cloudinary) and the judge AI-safety answers.

**T4.1 — App setup, design system, task board (hour 0–1)**

- Next.js app with routes from §3. `lib/api.ts` calls the mock backend. Task board with one card per task ID.
- Design tokens: large type (≥22px body), 64px+ tap targets, calm colours, high-contrast theme.
- Choose one Cloudinary tile recipe: square crop with automatic subject/face focus, background removed, same padding and rounded corners; plus a high-contrast version.
- ✅ Done when: app runs and shows mock data.

**T4.2 — Cloudinary pipeline + binder extraction prompt (hours 1–3)**

- Staff upload widget (unsigned preset). Save the public ID through the backend.
- Tile component builds the image URL with the chosen transformation recipe. Process all seed photos and send IDs to T2.
- **Binder importer** (with T2's T2.2 seed): Gemini document understanding over the fictional binder PDF → structured facts (type, content, date). Each saved via `remember` with `source = document`. Prompt rules: extract only what the document states, keep the document's date, never invent, never mark as resident-confirmed. Stretch: staff upload UI for new documents.
- ✅ Done when: messy phone photos come out as matching tiles; binder facts land in the memory store labelled "From records" with dates.

**T4.3 — Shared components + staff shell (hours 3–6)**

- Shared tile/big-button/audio-playback components T3's Speak screen builds on (ready by hour 3 — this gates T3.3).
- Pick-a-resident screen and staff app shell. Milestone 1 support.
- ✅ Done when: T3 is unblocked on components; staff shell navigates.

**T4.4 — Coach agent + Coach chat + onboarding path (hours 6–10)**

- `POST /coach/ask`: recall relevant memories, profile, routines/planner, observations, EMH notes; answer in 1–3 plain sentences.
- Output includes sources: type (resident | staff | emh | document | pattern) and date for each fact — document facts read as "From records, ".
- If nothing relevant is found, return unknown ("I don't know, ask Marcus").
- Coach chat UI: text and voice; every answer shows source badges ("In Marcus's words", "Staff note, Mar 3", "Pattern noticed", "From records, 2019").
- Onboarding path: Essentials (2 min, generated from confirmed memories), Routines/planner, timeline, progress indicator.
- ✅ Done when: 15/15 test questions answered with correct source labels; unknowns handled; a new staff member can complete Essentials.

**T4.5 — Handoff screen + observation form (hours 10–12)**

- Handoff list ("since your last shift") and add-observation form. **Milestone 2.**
- ✅ Done when: Jordan's handoff renders T2's data; observations save.

**T4.6 — Memory subagents (hours 12–13 core; finish 16–18)**

- **Observer**: after every sentence, choice, observation or EMH note, extract candidate memories (type, content, evidence) and call remember with source = inferred or staff.
- **Retriever**: helper used by Voice, Coach, Action and Handoff to fetch top memories with status.
- Build both against T2's mocks before sleeping (hours 13–16); wire for real after.
- **Consolidator** (hours 16–18): recall similar memories; above a similarity threshold, increase times_seen; if a candidate contradicts a confirmed memory (tea vs coffee), call propose_update.
- **Routine finder** (hours 16–18): SQL groups events by weekday and hour; patterns seen 3+ times become suggested routines; Gemini phrases them. Runs on seeded data.
- ✅ Done when: the tea pattern appears in Marcus's "confirm?" queue; the Coach mentions it labelled "pattern noticed"; the binder's outdated coffee fact is flagged against the recent tea pattern. (Fallback: seeded "pattern noticed" item.)

**T4.7 — Action agent + activity log + wiring (hours 16–18)**

- `POST /actions/plan`: input a goal ("bowling Saturday"). Output steps chosen only from the allowed tools, each tagged online or staff, plus total cost. Hand the plan format to T3 for the approval card at hour 13 (format first, prompt later).
- Uses memories for usual details (2pm lane, sister Lisa's contact). Anything needing physical help becomes create_staff_task. Test with 5 goals.
- Activity log screen: actions, choices and sentences with times.
- Wire memory + actions end to end with T2. Freeze at 18.
- ✅ Done when: 5/5 goals split correctly into online actions and staff tasks; full demo flow clickable.

**T4.8 — Judge answers, polish and stretch (hours 18–24)**

- Write short answers for judge questions about AI safety (memory + actions), incl. the binder-import and Google Calendar questions.
- Support Ahmed's backup video recording at hour 20 (drive the staff screens).
- Bug fixes across staff screens. Stretch: manager view.
- ✅ Done when: judge AI-safety answers are written and rehearsed; staff screens stable through both rehearsals.

**Dependencies**: from T2 — mock endpoints (hour 1), memory + actions servers (hours 12–16). From T3 — Gemini wrapper (hour 1), suggestion format. From T1 — audio URLs, Coach voice agent wiring (hour 12).

### William (T4): Frontend, media and pitch lead

You own every screen, the Cloudinary photo pipeline, accessibility, and the pitch materials.

**T4.1 — App setup and design system (hour 0–1)**

- Next.js app with routes from §3. `lib/api.ts` calls the mock backend.
- Design tokens: large type (≥22px body), 64px+ tap targets, calm colours, high-contrast theme.
- xf
- ✅ Done when: app runs and shows mock data.

**T4.2 — Cloudinary pipeline (hours 1–3)**

- Staff upload widget (unsigned preset). Save the public ID through the backend.
- Tile component builds the image URL with the chosen transformation recipe.
- Process all seed photos and send IDs to T2.
- ✅ Done when: messy phone photos come out as matching tiles.

**T4.3 — Speak For Me screen (hours 3–6)**

- Tile grid by category, sentence strip at the top, "Help me say it" button.
- Suggestion cards (tap to hear preview), large ✅ and ❌ buttons, "speak tiles only" button.
- Long-press any button to hear its label.
- ✅ Done when: **Milestone 1** works with real suggestions and audio.

**T4.4 — My Planner screens (hours 6–10)**

- PhotoChoiceGrid: a question plus 2–4 big photo tiles; reused by the planner to pick a staff person and days (with T1/T3).
- Routine-input screen (person, start time, length, days — default all 7) and a weekly visit grid (7 days) showing blocks like 1:00p.m.–3:00p.m.
- Approval card before any booking; booking goes via T2's `book_staff_visit` (Google Calendar MCP), with a staff-uploaded .zip calendar export as the fallback, rendering the same grid.
- ✅ Done when: a routine set by taps shows on the weekly grid and an approved visit lands on the calendar.

**T4.5 — Staff screens (hours 10–14)**

- Pick-a-resident screen.
- Onboarding path: Essentials (2 min), Routines/planner, timeline, progress indicator.
- Coach chat: text and voice; every answer shows source badges ("In Marcus's words", "Staff note, Mar 3", "Pattern noticed").
- Handoff list and add-observation form.
- ✅ Done when: if a new staff member can complete Essentials and ask the Coach questions.

**T4.6 — Choice, action and memory screens (hours 14–16)**

- Choice screen: photo options with cost and "money left" line, plus "not decided yet".
- Action approval card: pictures for each step, total cost, approve and cancel; short cancel window after approval.
- Activity log: actions, choices and sentences with times.
- "Pattern noticed, confirm?" screen with yes/no tiles.
- Voice picker: play 3 previews, choose one.
- ✅ Done when: full demo flow clickable end to end.

**T4.7 — Accessibility pass (hours 16–18)**

- Check every screen: tap targets, contrast, no time limits, consistent layout, undo, labels spoken on long press.
- Test on a real tablet.
- ✅ Done when: someone outside the team can use the resident screens with no explanation.

**T4.8 — Pitch materials (hours 18–24)**

- Deck (6 slides): hook, what KW Habilitation told us, live demo, how it works, guardrails, what's next.
- Record and edit the backup demo video (under 3 minutes) at hour 20.
- Devpost write-up with sponsor categories. Point the GoDaddy domain at the web app.
- Stretch: manager view.
- ✅ Done when: deck, video, Devpost and live URL done by hour 23.

**Dependencies**: from T2 — mock endpoints (hour 1), book_staff_visit (hour 7). From T1 — /speak (hour 4), spoken planner-card format (hour 6). From T3 — suggestion, planner routine fields and Coach answer formats (hour 1).

## 8. Master schedule

| Hours | T1 | T2 | T3 | T4 |
|---|---|---|---|---|
| 0–1 | T1.1 voices | T2.1 repo, DB, mocks | T3.1 Gemini wrapper | T4.1 app setup, task board |
| 1–3 | T1.2 speak service | T2.2 seed data | T3.2 Voice agent | T4.2 Cloudinary, binder prompt |
| 3–6 | T1.2 + T1.3 | T2.3 profile MCP | T3.2 testing + T3.3 Speak screen | T4.3 components, staff shell |
| **6** | **MILESTONE 1** | **MILESTONE 1** | **MILESTONE 1** | **MILESTONE 1** |
| 6–9 | T1.4 spoken planner proposals | T2.4 real routes, EMH (sleep 7–10) | T3.4 grid + routine fields, T3.5 planner subagent | T4.4 My Planner screens |
| 9–12 | Sleep 9–12, then T1.5 booking readback | T2.4 continued | Sleep 9–12 | T4.4 planner screens, T4.5 Handoff screen |
| **12** | **MILESTONE 2** | **MILESTONE 2** | **MILESTONE 2** | **MILESTONE 2** |
| 12–14 | T1.5 booking readback, T1.6 Coach voice | T2.5 memory MCP | T3.6 Choice agent + screen | T4.6 memory core, then sleep 13–16 |
| 14–16 | T1.7 spoken approvals | T2.6 actions MCP | T3.7 approval card, confirm, voice picker | (sleep) |
| 16–18 | T1.8 latency | T2.7 Handoff, freeze | T3.8 accessibility pass | T4.6 finish + T4.7 Action agent, wiring |
| **18** | **FEATURE FREEZE** | **FEATURE FREEZE** | **FEATURE FREEZE** | **FEATURE FREEZE** |
| 18–20 | Demo audio | Stretch: Claude Desktop | T3.8 deck draft | T4.8 judge Q&A answers |
| 20–22 | Rehearsals, voice-over | README, reset data | Backup video, final deck | Video support, bug fixes |
| 22–24 | Final run-through | Final deploy | Devpost, domain | Stretch: manager view |

**Sleep shifts** (staggered so at least three people are always up): T2 hours 7–10 (right after Milestone 1 is solid). T1 + T3 hours 9–12, up for Milestone 2. T4 hours 13–16 (memory core built against mocks first; T2 builds the real memory/actions servers meanwhile). Nobody sleeps through a milestone or the freeze.

## 9. Integration test scripts

**Milestone 1 (hour 6)**

1. Open Marcus's home screen.
2. Tap coffee + now. Tap "Help me say it".
3. See 2–3 personal suggestions within 3 seconds.
4. Tap ✅ on one. Hear it in Marcus's voice within 2 seconds.
5. Check the sentence appears in the sentences table.

**Milestone 2 (hour 12)**

1. Set a routine by taps only ("meet staff 1:00p.m., 2h, every day"). See 1:00p.m.–3:00p.m. blocks on the weekly grid. Approve the booking; the staff visit lands on the calendar and the confirmation plays.
2. Switch to staff (Jordan). Ask the Coach "What upsets Marcus?" Answer has a source badge.
3. Ask something unknown. Coach says "I don't know, ask Marcus."

**Feature freeze (hour 18)**

1. Choice: bowling vs movie with costs; pick bowling; log says "Marcus chose".
2. Action: approval card appears; approve; booking page shows it; calendar entry exists; email arrives; staff task in Handoff.
3. Memory: tea pattern in "confirm?" queue; Coach mentions it as "pattern noticed"; confirm it; Coach now says "in Marcus's words".
4. Handoff for Jordan shows the bowling ride task and the cancelled grocery trip.
5. Reset demo data; run everything again cleanly.

## 10. Fallbacks

| If this fails | Fall back to | Owner |
|---|---|---|
| ElevenLabs Agent setup | On-screen questions + plain text-to-speech | T1 |
| Live TTS on venue wifi | Pre-generated audio for every demo line | T1 |
| Gemini slow or rate-limited | Cached suggestions and answers for demo inputs | T3 + T4 |
| Email sending | Show the message in the activity log as "sent" | T2 |
| Google Calendar API at venue | DB-only calendar entries — `calendar_events` is the source of truth and the UI reads from our DB either way | T2 |
| Memory subagents unfinished | Seeded "pattern noticed" item in the queue | T4 |
| Hosting down | Run everything locally on one laptop | T2 |
| Live demo breaks | Backup video (recorded at hour 20) | T3 |

## 11. Demo day checklist

- [ ] Demo data reset (T2).
- [ ] All demo audio pre-generated and cached (T1).
- [ ] Tablet charged, brightness up, notifications off (T3).
- [ ] Backup video downloaded locally (T3).
- [ ] Email inbox open on a second screen for the action moment (T2).
- [ ] Everyone knows their demo beat and one Q&A topic: T1 voice, T2 MCP and data, T3 resident experience and accessibility, T4 AI safety (memory + actions) and design.

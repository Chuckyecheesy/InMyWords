# Interface contracts — FROZEN AT HOUR 1

Changing any input or output after hour 1 requires a heads-up in team chat first.
Tiffany (T2) publishes hard-coded mock responses for everything at hour 1 so nobody waits.

Owners: **T1 = James** (Voice) · **T2 = Tiffany** (Data/MCP) · **T3 = Ahmed** (Resident experience & pitch) · **T4 = William** (Staff experience)

## Backend API

| Endpoint | Input | Output | Owner |
|---|---|---|---|
| `GET /residents/{id}` | — | name, voice_id, tiles, communication style | T2 |
| `PUT /residents/{id}/voice` | voice_id | ok | T2 |
| `POST /suggest` | resident_id, tiles, time | options: 2–3 sentences | T3 |
| `POST /speak` | resident_id, text | audio_url | T1 |
| `POST /sentences` | resident_id, tiles, chosen_text, approved | id | T2 |
| `POST /planner/routine` | resident_id, person, start, length_min, days (default all 7) | routine_id, expanded visit blocks | T2 |
| `POST /planner/plan` | resident_id, routine_id | proposed visit_events (start, end, person) for approval | T3 |
| `POST /planner/book` | resident_id, visit_events, approved | booked ids, google_event_ids (via Google Calendar MCP; DB rows are source of truth) | T2 |
| `GET /planner/{resident_id}` | — | weekly visit blocks (start, end, person, day, source) | T2 |
| `POST /coach/ask` | resident_id, question | answer, sources (type, date) | T4 |
| `POST /choices` | resident_id, question, options | options with consequences | T3 |
| `POST /choices/{id}/decide` | chosen \| not_yet_decided | ok | T2 |
| `POST /actions/plan` | resident_id, goal | online steps, staff tasks, total cost | T4 |
| `POST /actions/{id}/approve` | — | results per step | T2 |
| `GET /memories/pending/{resident_id}` | — | memories waiting for confirmation | T2 |
| `POST /memories/{id}/confirm` | yes \| no | ok | T2 |
| `GET /handoff` | staff_id, resident_id | items with type and date | T2 |
| `GET /activity/{resident_id}` | — | actions, choices, sentences log | T2 |
| `POST /observations` | resident_id, staff_id, note | ok | T2 |
| `POST /input-events` *(gaze/gesture, Nov 8)* | events: [{ts, resident_id, session_id, input_type, action, target, hold_ms, gesture, confidence, outcome}] | saved: N | T2 |
| `GET /input-profile/{resident_id}` *(gaze/gesture, Nov 8)* | — | preferred_select, preferred_yes, dwell_ms, rates, notes, events_counted, confidence | T2 |

## Cross-team data shapes (PROJECT_PLAN §7)

- **Sentence suggestions**: in resident + tiles + time of day → out list of 2–3 sentences
- **Speak**: in sentence + resident → out audio URL
- **Ask about**: in resident + question → out answer, source (`resident | staff | emh | document | pattern`), date
- **Save routine**: in resident + person + start + length + days → out routine ID + expanded visit blocks
- **Book staff visit**: in resident + approved visit_events → out booked ids + google_event_ids (manual-import fallback if MCP down)
- **Choice**: in resident + options (label, photo, cost) → out choice ID and status
- **Handoff**: in staff + resident → out list of items with type and date
- **Recall**: in resident + query + type → out memories with source and confirmed status
- **Confirm memory**: in resident + memory + yes/no → out updated status
- **Plan actions**: in resident + goal → out online steps, staff tasks, cost
- **Run actions**: in approved plan ID → out results per step
- **Log input event** (memory MCP `log_input_event`): in one gaze/gesture/touch outcome event → out ok
- **Input profile** (memory MCP `get_input_profile`): in resident → out preferred select/yes, dwell_ms, rates, notes

## Source labels (used everywhere)

`resident` ("In Marcus's words") · `staff` (with date) · `emh` · `document` ("From records, 2019" — imported binder/record facts, confirmable like anything else) · `inferred`/`pattern` ("Pattern noticed" — until the resident confirms, then it becomes `resident`).

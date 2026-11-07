# Interface contracts — FROZEN AT HOUR 1

Changing any input or output after hour 1 requires a heads-up in team chat first.
Teammate 2 publishes hard-coded mock responses for everything at hour 1 so nobody waits.

## Backend API

| Endpoint | Input | Output | Owner |
|---|---|---|---|
| `GET /residents/{id}` | — | name, voice_id, tiles, communication style | T2 |
| `PUT /residents/{id}/voice` | voice_id | ok | T2 |
| `POST /suggest` | resident_id, tiles, time | options: 2–3 sentences | T3 |
| `POST /speak` | resident_id, text | audio_url | T1 |
| `POST /sentences` | resident_id, tiles, chosen_text, approved | id | T2 |
| `POST /story/answer` | resident_id, chapter, question, answer | ok (webhook for Story agent) | T2 |
| `POST /story/draft` | resident_id, chapter | chapter text | T3 |
| `POST /story/approve` | chapter_id | audio_url | T1 |
| `GET /story/{resident_id}` | — | chapters with photos, text, audio | T2 |
| `POST /coach/ask` | resident_id, question | answer, sources (type, date) | T3 |
| `POST /choices` | resident_id, question, options | options with consequences | T3 |
| `POST /choices/{id}/decide` | chosen \| not_yet_decided | ok | T2 |
| `POST /actions/plan` | resident_id, goal | online steps, staff tasks, total cost | T3 |
| `POST /actions/{id}/approve` | — | results per step | T2 |
| `GET /memories/pending/{resident_id}` | — | memories waiting for confirmation | T2 |
| `POST /memories/{id}/confirm` | yes \| no | ok | T2 |
| `GET /handoff` | staff_id, resident_id | items with type and date | T2 |
| `GET /activity/{resident_id}` | — | actions, choices, sentences log | T2 |
| `POST /observations` | resident_id, staff_id, note | ok | T2 |

## Cross-team data shapes (PROJECT_PLAN §7)

- **Sentence suggestions**: in resident + tiles + time of day → out list of 2–3 sentences
- **Speak**: in sentence + resident → out audio URL
- **Ask about**: in resident + question → out answer, source (`resident | staff | emh | document | pattern`), date
- **Story save**: in resident + chapter + text + photo IDs → out chapter ID
- **Choice**: in resident + options (label, photo, cost) → out choice ID and status
- **Handoff**: in staff + resident → out list of items with type and date
- **Recall**: in resident + query + type → out memories with source and confirmed status
- **Confirm memory**: in resident + memory + yes/no → out updated status
- **Plan actions**: in resident + goal → out online steps, staff tasks, cost
- **Run actions**: in approved plan ID → out results per step

## Source labels (used everywhere)

`resident` ("In Marcus's words") · `staff` (with date) · `emh` · `document` ("From records, 2019" — imported binder/record facts, confirmable like anything else) · `inferred`/`pattern` ("Pattern noticed" — until the resident confirms, then it becomes `resident`).

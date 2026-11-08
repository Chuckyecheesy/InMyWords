# api/ — FastAPI backend

**Owners: Tiffany, T2 (routes, services) · Ahmed, T3 (`agents/` voice, story, choice + `services/gemini.py`) · William, T4 (`agents/` coach, action, memory incl. binder importer) · James, T1 (`services/elevenlabs.py`)**

The single place for auth and logging. The web app and ElevenLabs agent webhooks call these routes; routes call the MCP servers via `services/mcp_client.py`. **Agents never touch the database directly.**

## Planned structure (BUILD_PLAN §3)

```
main.py                FastAPI app and routes (T2) — every endpoint in BUILD_PLAN §6,
                       all returning hard-coded mock JSON by hour 1
agents/
  voice.py             tile tap → 2–3 written sentences (T3.2, wired to POST /suggest)
  coach.py             sourced answers, "I don't know, ask Marcus" (T4)
  story.py             chapter writing from interview answers (T3)
  choice.py            consequences, never recommends (T3)
  action.py            online steps vs. staff tasks, approval card (T4)
  handoff.py           since-last-shift summary (T2)
  memory/              observer.py, consolidator.py, routines.py, retriever.py,
                       binder importer (T4)
services/
  gemini.py            structured JSON output + embeddings (T3.1, done)
  elevenlabs.py        TTS with cache by voice_id + text (T1)
  cloudinary.py        photo pipeline helpers
  mcp_client.py        one function per MCP tool (T2)
tests/                 test sets: 15 tile combos, 15 staff questions, 5 action goals (T3)
```

API contracts are frozen at hour 1 — see [docs/CONTRACTS.md](../docs/CONTRACTS.md).

## Gemini wrapper (T3.1)

`services/gemini.py` is the only Gemini client. Agents pass a prompt and a schema; they do not call the SDK themselves.

```python
from services.gemini import SCHEMAS, embed, generate_json

suggestions = generate_json(prompt, SCHEMAS["voice"]["suggestions"], system=rules)
vector = embed(memory_text)                       # store with RETRIEVAL_DOCUMENT
query = embed(question, task_type="RETRIEVAL_QUERY")
```

`SCHEMAS` is grouped by agent: `voice.suggestions`, `story.draft`, `choice.consequences`, `coach.answer`, `memory.document_facts`, `memory.candidates`, `memory.routine`, `memory.contradiction`, `action.plan`, `handoff.items`. Those lookup names are internal. JSON fields inside each schema follow [docs/CONTRACTS.md](../docs/CONTRACTS.md) (`options`, `text`, `answer`, `sources`, `online_steps`, `staff_tasks`, `items`). Samples that already validate are in `EXAMPLES`, with the same grouping.

`embed` always returns 768 floats, L2-normalized, matching `memories.embedding VECTOR(768)`. Do not change that size.

Choice lines and action steps do not include a money total. Code sums cost and money left, then phrases the number it computed.

`GEMINI_API_KEY` is required for a live call. Optional overrides: `GEMINI_MODEL` (default `gemini-3.8-flash`), `GEMINI_EMBED_MODEL` (default `gemini-embedding-001`).

```bash
python -m unittest tests.test_gemini
```

## ElevenLabs voice service (T1)

`services/elevenlabs.py` is the only ElevenLabs client (plain REST via `httpx`). It needs `ELEVENLABS_ID` in the repo-root `.env`. Without the key, `/speak` stays in mock mode and returns the placeholder URL, so the app still runs.

- `POST /speak {resident_id, text}` → `{audio_url, cached}`. Call it **only after the resident approves** the text. For "speak tiles only", send the tile words as `text` (`"coffee now"`).
  - Audio comes from the low-latency `eleven_flash_v2_5` model and is cached on disk by model + voice + text in `api/audio-cache/` (gitignored), then served at `/audio/<hash>.mp3`. A repeated line never calls ElevenLabs again.
  - If ElevenLabs fails, the route returns 502 with a friendly message, and the screen keeps the tiles visible.
- The resident's voice is picked in this order: the voice set with `PUT /residents/{id}/voice` → the profile's `voice_id` → the default in `services/voices.json` → an ElevenLabs stock voice.
- `GET /voices/{resident_id}` → `{current, options: [{voice_id, label, preview_text, preview_url}]}` feeds the voice picker. This endpoint is additive and not in the frozen table.

```bash
python -m scripts.design_voices    # T1.1: 3 designed voices each for Marcus + Dana → services/voices.json
python -m scripts.pregenerate      # warm the cache: tile labels + demo lines
python -m unittest tests.test_elevenlabs
```

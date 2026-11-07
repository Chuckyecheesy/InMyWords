# api/ — FastAPI backend

**Owners: Tiffany, T2 (routes, services) · Ahmed, T3 (`agents/` voice, story, choice + `services/gemini.py`) · William, T4 (`agents/` coach, action, memory incl. binder importer) · James, T1 (`services/elevenlabs.py`)**

The single place for auth and logging. The web app and ElevenLabs agent webhooks call these routes; routes call the MCP servers via `services/mcp_client.py`. **Agents never touch the database directly.**

## Planned structure (BUILD_PLAN §3)

```
main.py                FastAPI app and routes (T2) — every endpoint in BUILD_PLAN §6,
                       all returning hard-coded mock JSON by hour 1
agents/
  voice.py             tile → 2-3 sentence suggestions (T3)
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

suggestions = generate_json(prompt, SCHEMAS["suggest"], system=rules)
vector = embed(memory_text)                       # store with RETRIEVAL_DOCUMENT
query = embed(question, task_type="RETRIEVAL_QUERY")
```

`SCHEMAS` keys: `suggest`, `story_draft`, `choice_consequences`, `coach_answer`, `binder_facts`, `observer_memories`, `routine_phrase`, `contradiction`, `action_plan`, `handoff_bullets`. Samples that already validate are in `EXAMPLES`.

`embed` always returns 768 floats, L2-normalized, matching `memories.embedding VECTOR(768)`. Do not change that size.

Choice lines and action steps do not include a money total. Code sums cost and money left, then phrases the number it computed.

`GEMINI_API_KEY` is required for a live call. Optional overrides: `GEMINI_MODEL` (default `gemini-3.8-flash`), `GEMINI_EMBED_MODEL` (default `gemini-embedding-001`).

```bash
python -m unittest tests.test_gemini
```

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
  gemini.py            structured JSON output + embeddings (T3)
  elevenlabs.py        TTS with cache by voice_id + text (T1)
  cloudinary.py        photo pipeline helpers
  mcp_client.py        one function per MCP tool (T2)
tests/                 test sets: 15 tile combos, 15 staff questions, 5 action goals (T3)
```

API contracts are frozen at hour 1 — see [docs/CONTRACTS.md](../docs/CONTRACTS.md).

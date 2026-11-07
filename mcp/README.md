# mcp/ — MCP servers

**Owner: Tiffany (T2)** (Data & MCP lead)

Four Python FastMCP servers over **streamable HTTP**, so both our backend and Claude Desktop (stretch demo) can connect to the same servers. All agent data access goes through these — never direct DB access from agents.

## Status & running

| Server | Status | Run |
|---|---|---|
| profile (`profile_server.py`, :8101) | ✅ built, 8 tools | `cd mcp && python profile_server.py` |
| emh (`emh_server.py`, :8104) | ✅ built, 3 tools | `cd mcp && python emh_server.py` |
| memory (`memory_server.py`, :8102) | ✅ built, 5 tools + `get_pending` | `cd mcp && python memory_server.py` |
| actions (`actions_server.py`, :8103) | ✅ built, 6 tools + approve/cancel/activity | `cd mcp && python actions_server.py` |

Actions notes: `plan_actions` only **proposes** (deterministic placeholder until William's Action agent, T4.7 — same shape). `approve_plan` runs the steps from the allowlist, logs each to `action_results`, and the executing tools **refuse any plan that isn't approved** — the gate lives in the server, not the UI. `cancel_plan` works until steps have run. Email is real when `EMAIL_SENDER_*` creds exist, otherwise logged as sent. The mock booking page (`python mock-booking/app.py`, :8200) shows bookings landing live.

Memory notes: `recall` ranks by keyword + recency (vector similarity joins the ranking once embeddings are backfilled after T3.1 — same output shape). Confirming a memory flips it to `confirmed` with `source = resident` ("in Marcus's words"); dismissing marks it `dismissed`. `remember` merges near-duplicates by word overlap and bumps `times_seen`.

`pip install -r requirements.txt` first. Smoke test (servers running): `python test_servers.py`.

Data layer: `store.py` uses **Postgres when `DATABASE_URL` is set**, otherwise falls back to the **seed JSON in `db/seed/`** (writes are in-memory only in seed mode). The backend reaches these servers through `api/services/mcp_client.py` and falls back to mock JSON when a server is down — the frontend never breaks either way.

| Server | Tools |
|---|---|
| `profile_server/` | get_profile, get_story, save_story_chapter, ask_about, suggest_sentence, log_sentence, log_choice, add_observation |
| `memory_server/` | remember, recall(query, type), get_routines, propose_update, confirm_memory |
| `actions_server/` | plan_actions, send_message (real email), add_to_calendar, book_activity (mock site), next_bus (optional), create_staff_task |
| `emh_server/` | get_contact_notes, get_checklist, get_significant_events — **mock**; pitch point: swap for a real EMH connection with zero agent code changes |

Rules baked in:
- Every returned fact includes **source and date**.
- `recall` ranks by vector similarity + keyword match + recency, and returns confirmation status with every memory.
- Action tools **refuse to run unless the plan status is approved**.
- Confirmed memories *are* the profile — profile_server reads from the memory store.

Tasks: T2.3, T2.5, T2.6 in [docs/BUILD_PLAN.md](../docs/BUILD_PLAN.md).

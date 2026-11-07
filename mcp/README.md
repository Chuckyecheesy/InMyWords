# mcp/ — MCP servers

**Owner: Teammate 2** (Data & MCP lead)

Four Python FastMCP servers over **streamable HTTP**, so both our backend and Claude Desktop (stretch demo) can connect to the same servers. All agent data access goes through these — never direct DB access from agents.

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

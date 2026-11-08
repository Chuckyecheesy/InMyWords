"""Planner subagent (PROJECT_PLAN §2.5): puts approved visits on Google Calendar.

Gemini does the work. It is handed the approved visits and writes each one
to staff's calendar itself, through Gemini function calling. Its only tool is
the actions MCP server's gated write (write_calendar_event, or
write_imported_event for a staff .zip import). It picks the wording and
issues the calls; the server checks every call.

The deterministic route is the fallback. If Gemini is off, errors out,
sends bad times, or stops before every visit is written, plain code
(book_staff_visit / commit_calendar_import) writes whatever is still
missing. Both routes are idempotent, so a visit is never written twice.

Guardrails (CLAUDE.md):
- Rule 5: nothing is written until approve_visits / approve_calendar_import
  pass. The server refuses writes for anything unapproved.
- Rule 6: times come from plain code. The model must echo the exact
  approved times; the server rejects any mismatch and always writes the
  DB times.
- Rule 4: this module never touches the DB. It only calls MCP tools
  through `call_tool(name, args) -> dict`.
"""

from __future__ import annotations

import os
from typing import Callable

CallTool = Callable[[str, dict], dict]

# Per Gemini request. The live happy path took ~8s for 7 visits in 2 turns.
AGENT_TIMEOUT_MS = int(os.environ.get("PLANNER_GEMINI_TIMEOUT_MS", "12000"))

SYSTEM = (
    "You are the Planner subagent for In My Words, a communication app for people "
    "in supported living. You put visits the resident already approved onto staff's "
    "Google Calendar by calling tools. You never change a time, never invent a visit, "
    "and never write health, money, phone numbers or personal details."
)

WRITE_VISIT = {
    "name": "write_calendar_event",
    "description": "Write ONE approved visit to the staff member's Google Calendar. "
                   "Call it once for every visit listed. Copy visit_id, start and end exactly.",
    "parameters": {
        "type": "object",
        "properties": {
            "visit_id": {"type": "integer", "description": "The visit's id, exactly as listed."},
            "start": {"type": "string", "description": "Start time exactly as listed (ISO 8601 with offset)."},
            "end": {"type": "string", "description": "End time exactly as listed (ISO 8601 with offset)."},
            "summary": {"type": "string", "description": "Short event title, e.g. 'Visit with Dana'."},
            "description": {"type": "string",
                            "description": "One plain sentence. Say the resident approved it."},
        },
        "required": ["visit_id", "start", "end", "summary", "description"],
    },
}

WRITE_IMPORTED = {
    "name": "write_imported_event",
    "description": "Write ONE approved event from the staff member's calendar export to their "
                   "Google Calendar. Call it once per listed event. Copy event_id, start and end exactly.",
    "parameters": {
        "type": "object",
        "properties": {
            "event_id": {"type": "string", "description": "The event's id, exactly as listed."},
            "start": {"type": "string", "description": "Start exactly as listed."},
            "end": {"type": "string", "description": "End exactly as listed."},
            "summary": {"type": "string", "description": "The event title as listed (you may tidy spacing)."},
        },
        "required": ["event_id", "start", "end", "summary"],
    },
}


def gemini_enabled() -> bool:
    if os.environ.get("PLANNER_GEMINI") == "0":
        return False
    try:
        from services import gemini
        gemini._load_env()
    except Exception:
        return False
    return bool(os.environ.get("GEMINI_API_KEY", "").strip())


def default_run_tools():
    """The real Gemini tool loop, or None when Gemini is off (rules only)."""
    if not gemini_enabled():
        return None
    from services.gemini import run_tools
    return run_tools


def booking_prompt(name: str, visits: list[dict]) -> str:
    lines = "\n".join(
        f"- visit_id={v['id']} staff={v['staff']} start={v['starts_at']} end={v['ends_at']}"
        for v in visits)
    return (
        f"{name} approved these staff visits in My Planner. Put every one on the staff "
        f"member's Google Calendar: call write_calendar_event once per visit (you may make "
        f"several calls at once).\n\n{lines}\n\n"
        f"Copy visit_id, start and end exactly as listed. summary: short, like "
        f"'Visit with {name}'. description: one plain sentence saying it was approved by {name}. "
        f"If a call says the times do not match, call again with the times it gives. If a call "
        f"says the calendar is unreachable, stop. When every visit is written, reply 'done'."
    )


def import_prompt(staff: str, events: list[dict]) -> str:
    lines = "\n".join(
        f"- event_id={e['id']} title={e['title']!r} start={e['starts_at']} end={e['ends_at']}"
        for e in events)
    return (
        f"Staff member {staff} approved importing these events from their calendar export into "
        f"their live Google Calendar. Call write_imported_event once per event.\n\n{lines}\n\n"
        f"Copy event_id, start and end exactly. Keep each title as listed. A call that says the "
        f"event overlaps or was already imported is fine; move on. If the calendar is "
        f"unreachable, stop. When done, reply 'done'."
    )


def _run_agent(run_tools, prompt: str, tool: dict, execute, record: dict) -> None:
    """Run the Gemini tool loop; note why it fell short, never raise."""
    def stop(calls):
        return record["calendar_down"]

    def counted(name, args):
        # Counted as they happen: a model error on a later turn must not
        # hide the calls that already ran.
        record["model_calls"] += 1
        return execute(name, args)

    try:
        # One model, firm deadline: when Gemini is slow, plain code is the
        # faster fallback, not a second model.
        out = run_tools("planner", prompt, [tool], counted, system=SYSTEM, max_turns=4,
                        should_stop=stop, timeout_ms=AGENT_TIMEOUT_MS, use_fallback_model=False)
        if not out.get("finished", True):
            record["note"] = "Gemini ran out of turns"
    except Exception as exc:
        record["note"] = f"Gemini failed ({type(exc).__name__})"
        print(f"[planner] Gemini tool loop failed, deterministic route takes over: {exc}")


def _route(gemini_wrote: int, rules_wrote: int) -> str:
    if gemini_wrote and rules_wrote:
        return "gemini+rules"
    return "gemini" if gemini_wrote else "rules"


def book_visits(resident: str, routine_id: int, approved: bool, *, call_tool: CallTool,
                run_tools=None) -> dict:
    """Approve a routine's visits, let Gemini write them to Google Calendar,
    then let the deterministic route write anything still missing."""
    if approved is not True:
        # The server owns the refusal so the rule lives in one place.
        return call_tool("book_staff_visit", {"resident": resident, "routine_id": routine_id,
                                              "approved": False})
    gate = call_tool("approve_visits", {"resident": resident, "routine_id": routine_id, "approved": True})
    if gate.get("error") or gate.get("refused"):
        return gate
    name = gate.get("resident_name") or resident.capitalize()
    pending = {v["id"]: v for v in gate["visits"] if not v.get("google_synced")}
    record = {"model_calls": 0, "written": [], "rejected": 0, "calendar_down": False, "note": ""}

    def execute(tool_name: str, args: dict) -> dict:
        if tool_name != WRITE_VISIT["name"]:
            return {"error": f"unknown tool '{tool_name}'"}
        try:
            visit_id = int(args.get("visit_id"))
        except (TypeError, ValueError):
            visit_id = None
        if visit_id not in pending:
            record["rejected"] += 1
            return {"error": "visit_id must be one of the listed visits"}
        result = call_tool(WRITE_VISIT["name"], {
            "resident": resident, "visit_id": visit_id,
            "start": str(args.get("start", "")), "end": str(args.get("end", "")),
            "summary": str(args.get("summary", "")), "description": str(args.get("description", "")),
        })
        if result.get("google_event_id") and not result.get("skipped"):
            record["written"].append(visit_id)
        elif result.get("calendar_down"):
            record["calendar_down"] = True
        elif result.get("error"):
            record["rejected"] += 1
        return result

    if pending and run_tools is not None:
        _run_agent(run_tools, booking_prompt(name, list(pending.values())), WRITE_VISIT, execute, record)
    elif pending:
        record["note"] = "Gemini is off"

    status = call_tool("get_booking", {"resident": resident, "routine_id": routine_id})
    before = set(status.get("google_event_ids", []))
    missing = [v for v in status.get("visits", []) if not v.get("google_synced")]
    if missing:
        if not record["note"]:
            record["note"] = ("the calendar is down" if record["calendar_down"]
                              else f"Gemini left {len(missing)} visit(s) unwritten")
        status = call_tool("book_staff_visit", {"resident": resident, "routine_id": routine_id,
                                                "approved": True})
    rules_wrote = len(set(status.get("google_event_ids", [])) - before)
    status["planner"] = _route(len(record["written"]), rules_wrote)
    status["agent"] = {"model_calls": record["model_calls"], "gemini_wrote": len(record["written"]),
                       "rules_wrote": rules_wrote, "rejected_calls": record["rejected"],
                       "fallback_reason": record["note"] if rules_wrote or missing else ""}
    return status


def import_events(staff: str, import_id: str, approved_ids: list[str], approved: bool, *,
                  call_tool: CallTool, run_tools=None) -> dict:
    """Staff calendar import: approval, Gemini writes each ticked event, the
    deterministic commit finishes the rest. Duplicates are skipped either way."""
    args = {"staff": staff, "import_id": import_id, "approved_ids": list(approved_ids), "approved": approved}
    gate = call_tool("approve_calendar_import", args)
    if gate.get("error") or gate.get("refused"):
        return gate
    events = {e["id"]: e for e in gate["events"]}
    record = {"model_calls": 0, "written": [], "rejected": 0, "calendar_down": False, "note": ""}
    done: dict[str, str] = {}      # event id -> google id (written by Gemini)
    skipped: set[str] = set()      # duplicates the server refused

    def execute(tool_name: str, call: dict) -> dict:
        if tool_name != WRITE_IMPORTED["name"]:
            return {"error": f"unknown tool '{tool_name}'"}
        event_id = str(call.get("event_id", ""))
        if event_id not in events:
            record["rejected"] += 1
            return {"error": "event_id must be one of the listed events"}
        result = call_tool(WRITE_IMPORTED["name"], {
            "staff": staff, "import_id": import_id, "event_id": event_id,
            "start": str(call.get("start", "")), "end": str(call.get("end", "")),
            "summary": str(call.get("summary", "")),
        })
        if result.get("google_event_id"):
            done[event_id] = result["google_event_id"]
            record["written"].append(event_id)
        elif result.get("duplicate"):
            skipped.add(event_id)
        elif result.get("skipped"):
            done.setdefault(event_id, "")
        elif result.get("calendar_down"):
            record["calendar_down"] = True
        elif result.get("error"):
            record["rejected"] += 1
        return result

    if events and run_tools is not None:
        _run_agent(run_tools, import_prompt(staff, list(events.values())), WRITE_IMPORTED, execute, record)
    elif events:
        record["note"] = "Gemini is off"

    remaining = [i for i in approved_ids if i not in done and i not in skipped]
    out = {"import_id": import_id, "google_event_ids": [g for g in done.values() if g],
           "skipped": sorted(skipped)}
    rules_wrote = 0
    if remaining:
        if not record["note"]:
            record["note"] = ("the calendar is down" if record["calendar_down"]
                              else f"Gemini left {len(remaining)} event(s) unwritten")
        rules = call_tool("commit_calendar_import", {**args, "approved_ids": remaining})
        rules_wrote = len(rules.get("google_event_ids", []))
        out["google_event_ids"] += rules.get("google_event_ids", [])
        out["skipped"] = sorted(skipped | set(rules.get("skipped", [])))
        if rules.get("error"):
            out["error"] = rules["error"]
    out["planner"] = _route(len(record["written"]), rules_wrote)
    out["agent"] = {"model_calls": record["model_calls"], "gemini_wrote": len(record["written"]),
                    "rules_wrote": rules_wrote, "rejected_calls": record["rejected"],
                    "fallback_reason": record["note"] if rules_wrote or remaining else ""}
    return out

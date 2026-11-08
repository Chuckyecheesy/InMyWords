"""Action agent (BUILD_PLAN T4.7).

Turns a goal ("bowling Saturday") into a PROPOSED plan: online steps drawn
only from the allowlist, plus staff tasks for anything needing physical help.

Rules (see CLAUDE.md):
- Nothing runs here. Status is always 'proposed'; the resident approves on
  the card, and the actions MCP server runs the steps.
- Steps come only from ALLOWED_STEPS. Anything else is dropped.
- Cost is plain code (catalog prices, then a sum). The LLM only phrases the
  message text, and its output is discarded if it mentions money.
- Usual details (time, Lisa) come from memories passed in by the caller;
  this module never reads the database.
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Callable

ALLOWED_STEPS = ("book_activity", "add_to_calendar", "send_message", "create_staff_task")

# Plain-code prices for bookable activities. Unknown activity = free.
PRICES = {"bowling": 15.0, "movie": 12.0}
VENUES = {"bowling": "KW Bowl", "movie": "Waterloo Cinema"}
DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
DEFAULT_HOUR = 14  # 2pm unless a memory says otherwise


def _activity(goal: str) -> str | None:
    g = goal.lower()
    for key in ("bowling", "movie"):
        if key in g:
            return key
    return None


def _usual_hour(memories: list[dict]) -> int:
    for m in memories:
        found = re.search(r"\b(\d{1,2})\s*(am|pm)\b", m.get("content", ""), re.I)
        if found:
            hour = int(found.group(1)) % 12
            return hour + (12 if found.group(2).lower() == "pm" else 0)
    return DEFAULT_HOUR


def _has_lisa(memories: list[dict]) -> bool:
    return any("lisa" in m.get("content", "").lower() for m in memories)


def _clock(hour: int) -> str:
    return f"{hour % 12 or 12}:00{'am' if hour < 12 else 'pm'}"


def _when(goal: str, today: date) -> tuple[str, str]:
    """(weekday name, ISO date). No weekday in the goal -> next Saturday."""
    g = goal.lower()
    name = next((d for d in DAYS if d in g), "saturday")
    ahead = (DAYS.index(name) - today.weekday()) % 7 or 7
    return name.capitalize(), (today + timedelta(days=ahead)).isoformat()


def _rule_steps(goal, memories, phrase, today):
    activity = _activity(goal)
    g = goal.lower()
    hour = _usual_hour(memories)
    day, iso = _when(goal, today)
    at = f"{day} {_clock(hour)}"
    start = f"{iso}T{hour:02d}:00:00"
    leave = f"{iso}T{max(hour - 1, 0):02d}:30:00"
    steps: list[dict] = []

    if activity:
        venue = VENUES[activity]
        steps.append({"step": "book_activity", "kind": "online",
                      "detail": f"{activity.capitalize()} at {venue}, {at}",
                      "activity": f"{activity.capitalize()} — {venue}", "time": start})
    if re.search(r"\b(call|text|email|tell)\b", g) and "lisa" in g or (
            activity == "bowling" and _has_lisa(memories)):
        steps.append({"step": "send_message", "kind": "online", "contact": "lisa",
                      "detail": f"Email Lisa about: {goal}",
                      "text": f"Marcus would like to talk about: {goal}. Would you like to join?"})
    if "call" not in g:
        steps.append({"step": "add_to_calendar", "kind": "online",
                      "detail": f"{goal} — {at}", "title": goal, "time": start})
        # Going anywhere needs a person to go with them.
        what = f"Drive to {VENUES[activity]}" if activity else f"Support with: {goal}"
        steps.append({"step": "create_staff_task", "kind": "staff", "detail": what,
                      "task": what, "time": leave})

    for s in steps:
        if s["step"] == "send_message":
            nice = phrase(s["text"]) if phrase else s["text"]
            if isinstance(nice, str) and nice.strip() and "$" not in nice:
                s["text"] = nice
    return steps


def _sanitise(raw: list[dict], goal: str) -> list[dict]:
    """Keep allowlisted steps only; set kind and cost from code, not the model."""
    activity = _activity(goal)
    out = []
    for s in raw or []:
        name = s.get("step")
        if name not in ALLOWED_STEPS:
            continue
        clean = {k: v for k, v in s.items() if k != "cost"}
        clean["kind"] = "staff" if name == "create_staff_task" else "online"
        out.append(clean)
    for s in out:
        s["cost"] = PRICES.get(activity, 0.0) if s["step"] == "book_activity" else 0.0
    return out


def build_plan(
    goal: str,
    memories: list[dict],
    phrase: Callable[[str], str] | None = None,
    propose: Callable[[str, list[dict]], list[dict]] | None = None,
    today: date | None = None,
) -> dict:
    today = today or date.today()
    steps = None
    if propose is not None:
        try:
            steps = _sanitise(propose(goal, memories), goal)
        except Exception as exc:  # model down: fall back to the rules
            print(f"[action] propose failed, using rules: {exc}")
    if steps is None:
        steps = _sanitise(_rule_steps(goal, memories, phrase, today), goal)
        # _sanitise drops model-set costs; rule steps get catalog cost the same way.

    online = [s for s in steps if s["kind"] == "online"]
    staff = [s for s in steps if s["kind"] == "staff"]
    total = round(sum(s["cost"] for s in online), 2)  # plain code, never the LLM
    return {
        "goal": goal,
        "online_steps": online,
        "staff_tasks": [{"task": s.get("task", s["detail"]), "due": s.get("time")} for s in staff],
        "total_cost": total,
        "status": "proposed",
        "steps": steps,
    }


def _phrase_routine(group: dict) -> str:
    when = group["weekday"] + ("s" if group.get("hour") is None else f"s around {group['hour']}:00")
    return f"{group['content']} on {when}"


def _keyword(goal: str) -> str:
    activity = _activity(goal)
    if activity:
        return activity
    words = [word for word in re.findall(r"[a-z0-9]+", goal.lower()) if word not in {"a", "the", "on", "this"}]
    return words[0] if words else goal.lower()


def _retriever_note(raw: list[dict] | None, usable: list[dict]) -> str:
    if raw is None:
        return "The retriever could not reach saved memories."
    if not usable:
        return "No saved memory matched this choice."
    lines = []
    for memory in usable[:2]:
        content = " ".join(str(memory.get("content", "")).split())
        if content and content[-1] not in ".!?":
            content += "."
        label = memory.get("label")
        lines.append(f"{label}: {content}" if label else content)
    return " ".join(lines)


def _routine_note(events: list[dict] | None, keyword: str) -> str:
    from agents.memory.routines import find_routines

    if events is None:
        return "The routine finder could not read the outing record."
    rows = []
    for event in events:
        text = str(event.get("event") or event.get("content") or "")
        if keyword not in text.lower():
            continue
        at = str(event.get("date") or event.get("at") or "")[:10]
        if len(at) < 10:
            continue
        rows.append({"content": keyword.capitalize(), "at": at})
    if not rows:
        return "Nothing in the record repeats often enough to call a routine."
    found = find_routines(rows, phrase=_phrase_routine)
    if not found:
        return "Nothing in the record repeats often enough to call a routine."
    top = found[0]
    return f"{top['content']}. Seen {top['count']} times."


def _action_note(steps: list[dict]) -> str:
    pieces = []
    if any(step["step"] == "book_activity" for step in steps):
        pieces.append("Book it")
    if any(step["step"] == "add_to_calendar" for step in steps):
        pieces.append("add it to the calendar")
    message = next((step for step in steps if step["step"] == "send_message"), None)
    if message:
        who = str(message.get("contact") or "them").capitalize()
        pieces.append(f"email {who}")
    if any(step["step"] == "create_staff_task" for step in steps):
        driving = any(str(step.get("task", "")).startswith("Drive") for step in steps)
        pieces.append("ask staff for the ride" if driving else "ask staff to help")
    if not pieces:
        return "Nothing to do until you approve a plan."
    if len(pieces) == 1:
        sentence = pieces[0]
    elif len(pieces) == 2:
        sentence = f"{pieces[0]} and {pieces[1]}"
    else:
        sentence = ", ".join(pieces[:-1]) + f", and {pieces[-1]}"
    return sentence[0].upper() + sentence[1:] + "."


def _usable(memories: list[dict] | None) -> list[dict]:
    from agents.memory.retriever import retrieve

    if memories is None:
        return []
    kept = retrieve("resident", "choice", recall=lambda **_: memories)
    return [m for m in kept if m.get("status") not in ("pending", "rejected", "dismissed")]


def agent_notes(name: str, goal: str, memories: list[dict] | None, events: list[dict] | None, plan: dict) -> list[dict]:
    """What the choice screen shows beside the approval card."""
    usable = _usable(memories)
    return [
        {"id": "observer", "name": "Observer", "note": f"{name} chose {goal.strip()}."},
        {"id": "retriever", "name": "Retriever", "note": _retriever_note(memories, usable)},
        {"id": "routine", "name": "Routine finder", "note": _routine_note(events, _keyword(goal))},
        {"id": "action", "name": "Action", "note": _action_note(plan.get("steps") or [])},
    ]


def plan_with_notes(goal: str, *, name: str, memories: list[dict] | None, events: list[dict] | None, **plan_kwargs) -> dict:
    usable = _usable(memories)
    plan = build_plan(goal, usable, **plan_kwargs)
    plan["agents"] = agent_notes(name, goal, memories, events, plan)
    return plan


async def propose_plan(resident_id: str, goal: str, *, name: str) -> dict:
    """Recall through MCP, build the plan, and attach the four agent notes.
    A down server is named on that note. The plan still uses the catalog."""
    from services import mcp_client

    memories: list[dict] | None
    events: list[dict] | None
    try:
        seen: dict = {}
        for query in (goal, "usual time", "family sister contact"):
            for memory in (await mcp_client.recall(resident_id, query)).get("memories", []):
                if memory.get("status") not in ("pending", "rejected", "dismissed"):
                    seen[memory.get("id", memory.get("content"))] = memory
        memories = list(seen.values())
    except Exception as exc:
        print(f"[action] retriever skipped ({type(exc).__name__}): {exc}")
        memories = None
    try:
        significant = await mcp_client.get_significant_events(resident_id)
        events = list(significant.get("events") or [])
    except Exception as exc:
        print(f"[action] routine finder skipped ({type(exc).__name__}): {exc}")
        events = None
    return plan_with_notes(goal, name=name, memories=memories, events=events)

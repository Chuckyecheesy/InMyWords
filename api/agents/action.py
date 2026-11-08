"""Action agent (T4.7).

A goal becomes an approval-card plan. Steps stay on the allowlist.
Usual details (when, who to tell) come from the Retriever. A repeated
outing is reported by the Routine finder. Cost is a code table, never
a model's guess. Anything that needs a person becomes a staff task.

Nothing here touches the database. Callers pass memories and events
they already loaded through the MCP servers.
"""

from __future__ import annotations

import re

from agents.memory.retriever import retrieve
from agents.memory.routines import find_routines

# Next Saturday after the demo week. Bookings and the ride share this day.
_DEMO_DAY = "2026-11-14"
_DEMO_WEEKDAY = "Saturday"

# Known activities the resident can book. Prices live here, not in the model.
_CATALOG = {
    "bowling": {
        "activity": "Bowling — KW Bowl",
        "place": "KW Bowl",
        "cost": 15.0,
        "detail": "Lane at KW Bowl, Saturday 2:00pm",
    },
    "movie": {
        "activity": "Movie",
        "place": "the movie",
        "cost": 12.0,
        "detail": "Movie, Saturday afternoon",
    },
    "herb garden": {
        "activity": "Herb garden supplies",
        "place": "the herb garden",
        "cost": 22.0,
        "detail": "Herb garden supplies",
    },
    "groceries": {
        "activity": "Groceries",
        "place": "the grocery store",
        "cost": 40.0,
        "detail": "Grocery shop",
    },
}

_CONTACTS = ("lisa",)
_CLOCK = re.compile(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", re.I)


def _phrase_routine(group: dict) -> str:
    """Same sentence as agents.memory.wiring.plain_routine_text, without
    pulling the MCP client into this module."""
    when = group["weekday"] + ("s" if group.get("hour") is None else f"s around {group['hour']}:00")
    return f"{group['content']} on {when}"


def _catalog_key(goal: str) -> str | None:
    text = goal.lower()
    if "herb" in text:
        return "herb garden"
    for key in ("bowling", "movie", "groceries"):
        if key in text:
            return key
    return None


def _clock(text: str) -> tuple[int, int] | None:
    match = _CLOCK.search(text)
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2) or 0)
    if hour < 1 or hour > 12 or minute > 59:
        return None
    ampm = match.group(3).lower()
    if hour == 12:
        hour24 = 0 if ampm == "am" else 12
    else:
        hour24 = hour if ampm == "am" else hour + 12
    return hour24, minute


def _clock_label(hour24: int, minute: int) -> str:
    suffix = "am" if hour24 < 12 else "pm"
    hour12 = hour24 % 12 or 12
    return f"{hour12}:{minute:02d}{suffix}"


def _earlier(hour24: int, minute: int, minutes: int = 30) -> tuple[int, int]:
    total = (hour24 * 60 + minute - minutes) % (24 * 60)
    return divmod(total, 60)


def _iso(hour24: int, minute: int) -> str:
    return f"{_DEMO_DAY}T{hour24:02d}:{minute:02d}:00"


def _keyword(goal: str) -> str:
    key = _catalog_key(goal)
    if key == "herb garden":
        return "herb"
    if key:
        return key
    words = [word for word in re.findall(r"[a-z0-9]+", goal.lower()) if word not in {"a", "the", "on", "this"}]
    return words[0] if words else goal.lower()


def _usable(memories: list[dict]) -> list[dict]:
    confirmed = [m for m in memories if m.get("status") == "confirmed"]
    return confirmed or [m for m in memories if m.get("status") != "dismissed"]


def propose(
    resident_id: str,
    goal: str,
    *,
    name: str,
    memories: list[dict] | None,
    events: list[dict] | None,
) -> dict:
    """Build the plan and the four notes the choice screen shows."""
    connected = memories if memories is not None else []
    kept = retrieve(resident_id, goal, recall=lambda **_: connected)
    usable = _usable(kept)
    key = _catalog_key(goal)
    catalog = _CATALOG.get(key) if key else None
    keyword = _keyword(goal)

    when = _when(usable, catalog)
    contact = _contact(usable)
    steps = _steps(name, goal, catalog, when, contact)
    total = round(sum(step["cost"] for step in steps), 2)
    agents = [
        {"id": "observer", "name": "Observer", "note": f"{name} chose {goal.strip()}."},
        {"id": "retriever", "name": "Retriever", "note": _retriever_note(memories, usable)},
        {"id": "routine", "name": "Routine finder", "note": _routine_note(events, keyword)},
        {"id": "action", "name": "Action", "note": _action_note(steps, contact)},
    ]
    return {
        "goal": goal,
        "steps": steps,
        "online_steps": [
            {"step": step["step"], "detail": step["detail"], "cost": step["cost"]}
            for step in steps
            if step["kind"] == "online"
        ],
        "staff_tasks": [
            {"task": step["task"], "due": step["due"]}
            for step in steps
            if step["kind"] == "staff"
        ],
        "total_cost": total,
        "agents": agents,
    }


def _when(memories: list[dict], catalog: dict | None) -> tuple[int, int]:
    for memory in memories:
        found = _clock(str(memory.get("content", "")))
        if found:
            return found
    if catalog and catalog.get("activity", "").startswith("Bowling"):
        return 14, 0
    return 14, 0


def _contact(memories: list[dict]) -> str | None:
    for memory in memories:
        text = str(memory.get("content", "")).lower()
        for contact in _CONTACTS:
            if contact in text:
                return contact
    return None


def _steps(name: str, goal: str, catalog: dict | None, when: tuple[int, int], contact: str | None) -> list[dict]:
    hour, minute = when
    ride_hour, ride_minute = _earlier(hour, minute)
    when_label = f"{_DEMO_WEEKDAY} {_clock_label(hour, minute)}"
    ride_label = f"{_DEMO_WEEKDAY} {_clock_label(ride_hour, ride_minute)}"
    steps: list[dict] = []
    if catalog:
        detail = catalog["detail"]
        if catalog["activity"].startswith("Bowling"):
            detail = f"Lane at KW Bowl, {when_label}"
        steps.append({
            "step": "book_activity",
            "kind": "online",
            "detail": detail,
            "activity": catalog["activity"],
            "time": _iso(hour, minute),
            "cost": float(catalog["cost"]),
        })
    title = catalog["activity"] if catalog else goal.strip()
    steps.append({
        "step": "add_to_calendar",
        "kind": "online",
        "detail": f"{title} — {when_label}",
        "title": title,
        "time": _iso(hour, minute),
        "cost": 0,
    })
    # Bowling always tells Lisa: she is the catalog guest when memory names her,
    # and the demo contact when the retriever has nothing else to go on.
    guest = contact or ("lisa" if catalog and catalog["activity"].startswith("Bowling") else None)
    if guest:
        pretty = guest.capitalize()
        steps.append({
            "step": "send_message",
            "kind": "online",
            "contact": guest,
            "detail": f"Email {pretty}: {title}, {when_label}, want to come?",
            "text": f"{name} is going — {title}, {when_label} — and would love you to come.",
            "cost": 0,
        })
    place = catalog["place"] if catalog else goal.strip()
    if catalog and catalog["activity"].startswith("Bowling"):
        task = f"Drive {name} to KW Bowl"
    elif catalog:
        task = f"Go with {name} to {place}"
    else:
        task = f"Support {name} with: {goal.strip()}"
    steps.append({
        "step": "create_staff_task",
        "kind": "staff",
        "detail": task,
        "task": task,
        "time": _iso(ride_hour, ride_minute),
        "due": ride_label,
        "cost": 0,
    })
    return steps


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


def _action_note(steps: list[dict], contact: str | None) -> str:
    pieces = []
    if any(step["step"] == "book_activity" for step in steps):
        pieces.append("Book it")
    if any(step["step"] == "add_to_calendar" for step in steps):
        pieces.append("add it to the calendar")
    if contact or any(step["step"] == "send_message" for step in steps):
        who = (contact or "lisa").capitalize()
        pieces.append(f"email {who}")
    if any(step["step"] == "create_staff_task" for step in steps):
        driving = any(str(step.get("task", "")).startswith("Drive ") for step in steps)
        pieces.append("ask staff for the ride" if driving else "ask staff to help")
    if not pieces:
        return "Nothing to do until you approve a plan."
    sentence = pieces[0]
    if len(pieces) == 2:
        sentence = f"{pieces[0]} and {pieces[1]}"
    elif len(pieces) > 2:
        sentence = ", ".join(pieces[:-1]) + f", and {pieces[-1]}"
    return sentence[0].upper() + sentence[1:] + "."


async def propose_plan(resident_id: str, goal: str, *, name: str) -> dict:
    """Load memories and outings through MCP, then propose. A down server
    is reported on that agent's note; the plan still uses the catalog."""
    from services import mcp_client

    memories: list[dict] | None
    events: list[dict] | None
    try:
        query = goal
        if _catalog_key(goal) == "bowling":
            query = f"{goal} Saturday sister Lisa"
        recalled = await mcp_client.recall(resident_id, query)
        memories = list(recalled.get("memories") or [])
    except Exception as exc:
        print(f"[action] retriever skipped ({type(exc).__name__}): {exc}")
        memories = None
    try:
        significant = await mcp_client.get_significant_events(resident_id)
        events = list(significant.get("events") or [])
    except Exception as exc:
        print(f"[action] routine finder skipped ({type(exc).__name__}): {exc}")
        events = None
    return propose(resident_id, goal, name=name, memories=memories, events=events)

"""Action agent (BUILD_PLAN T4.7).

Turns a goal ("bowling Saturday") into a PROPOSED plan: online steps drawn
only from the allowlist, plus staff tasks for anything needing physical help.

Rules (see CLAUDE.md):
- Nothing runs here. Status is always 'proposed'; the resident approves on
  the card, and the actions MCP server runs the steps.
- Steps come only from ALLOWED_STEPS. Anything else is dropped.
- Gemini proposes the steps (gemini_propose); code grounds every field
  (ground_steps): catalog activities, known contacts, real future times,
  and any text that mentions money is discarded. With no key or a model
  failure, the plain rules (_rule_steps) build the plan instead.
- Cost is plain code (catalog prices, then a sum), never the model.
- Usual details (time, Lisa) come from memories passed in by the caller;
  this module never reads the database.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Callable

ALLOWED_STEPS = ("book_activity", "add_to_calendar", "send_message", "create_staff_task")

# Plain-code prices for bookable activities. Unknown activity = free.
PRICES = {"bowling": 15.0, "movie": 12.0}
VENUES = {
    "bowling": "KW Bowl",
    "movie": "Waterloo Cinema",
    "swimming": "Waterloo Rec Pool",
    "swim": "Waterloo Rec Pool",
    "basketball": "Community Court",
    "walk": "Victoria Park",
    "music": "Open Mic at The Jazz Room",
}
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
    planner = "rules"
    if propose is not None:
        try:
            steps = _sanitise(propose(goal, memories), goal)
            planner = "gemini"
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
        "planner": planner,
    }


# ---------- Gemini step proposer ----------
# Gemini picks the steps, day/time and wording. Code then grounds every field:
# allowlisted tools only, catalog activities only, known contacts only, a real
# future time, no money talk. Costs are never taken from the model.

KNOWN_CONTACTS = ("lisa",)
_HORIZON_DAYS = 60


def _memory_lines(memories: list[dict]) -> str:
    lines = []
    for m in memories[:8]:
        content = " ".join(str(m.get("content", "")).split())
        if content:
            label = m.get("label") or m.get("source") or "memory"
            lines.append(f"- [{label}] {content}")
    return "\n".join(lines) or "- (none)"


def proposal_prompt(goal: str, memories: list[dict], name: str, today: date) -> str:
    day, iso = _when(goal, today)
    hour = _usual_hour(memories)
    catalog = "\n".join(f"- {key}: {venue}" for key, venue in VENUES.items())
    return (
        f"You plan the steps for a goal {name} chose. {name} will approve or cancel the plan; nothing runs now.\n"
        f"Today is {today.isoformat()} ({DAYS[today.weekday()].capitalize()}).\n"
        f"Goal: {goal}\n\n"
        f"What we know (use usual times and contacts from here):\n{_memory_lines(memories)}\n\n"
        f"Tools (use only these):\n"
        f"- book_activity: only for a catalog activity. Set activity to its key and time.\n"
        f"- add_to_calendar: set title and time.\n"
        f"- send_message: email a known contact. contact must be one of: {', '.join(KNOWN_CONTACTS)}. "
        f"Write text in plain words from {name}'s side, inviting or telling them.\n"
        f"- create_staff_task: anything needing a person physically (driving, going with {name}, helping). "
        f"Set task and time (usually 30 minutes before).\n\n"
        f"Catalog activities:\n{catalog}\n\n"
        f"Rules: times are ISO 'YYYY-MM-DDTHH:MM:SS' in the future. If unsure of the day use {day} {iso}; "
        f"if unsure of the time use {hour:02d}:00. Going anywhere needs a staff task. "
        f"Only message a contact if the goal or the memories make it natural. "
        f"Never mention money, prices or payment. Do not invent places, people or tools. "
        f"Use empty strings for fields a step does not use."
    )


def _clean_text(value) -> str:
    text = " ".join(str(value or "").split())
    return "" if "$" in text else text


def _parse_time(value, today: date) -> str | None:
    try:
        when = datetime.fromisoformat(str(value).strip())
    except ValueError:
        return None
    if not today <= when.date() <= today + timedelta(days=_HORIZON_DAYS):
        return None
    return when.replace(tzinfo=None, microsecond=0).isoformat()


def ground_steps(raw: list[dict], goal: str, memories: list[dict], today: date) -> list[dict]:
    """Turn model steps into executable steps, or drop them. Raises when
    nothing usable is left so build_plan falls back to the rules."""
    day, iso = _when(goal, today)
    hour = _usual_hour(memories)
    default_start = f"{iso}T{hour:02d}:00:00"
    default_leave = f"{iso}T{max(hour - 1, 0):02d}:30:00"
    out: list[dict] = []
    for s in raw or []:
        name = s.get("step")
        detail = _clean_text(s.get("detail"))
        time = _parse_time(s.get("time"), today)
        if name == "book_activity":
            key = str(s.get("activity", "")).strip().lower()
            if key not in VENUES:
                continue  # no invented venues or free bookings
            at = time or default_start
            out.append({"step": name, "kind": "online", "activity": f"{key.capitalize()} — {VENUES[key]}",
                        "time": at, "detail": detail or f"{key.capitalize()} at {VENUES[key]}"})
        elif name == "add_to_calendar":
            title = _clean_text(s.get("title")) or goal
            out.append({"step": name, "kind": "online", "title": title,
                        "time": time or default_start, "detail": detail or f"{title} — {day}"})
        elif name == "send_message":
            contact = str(s.get("contact", "")).strip().lower()
            text = _clean_text(s.get("text"))
            if contact not in KNOWN_CONTACTS or not text:
                continue
            out.append({"step": name, "kind": "online", "contact": contact, "text": text,
                        "detail": detail or f"Email {contact.capitalize()} about: {goal}"})
        elif name == "create_staff_task":
            task = _clean_text(s.get("task")) or detail
            if not task:
                continue
            out.append({"step": name, "kind": "staff", "task": task,
                        "time": time or default_leave, "detail": detail or task})
    booking = next((s for s in out if s["step"] == "book_activity"), None)
    if booking and not any(s["step"] == "create_staff_task" for s in out):
        venue = booking["activity"].split(" — ", 1)[-1]
        out.append({"step": "create_staff_task", "kind": "staff", "task": f"Drive to {venue}",
                    "time": default_leave, "detail": f"Drive to {venue}"})
    if not out:
        raise ValueError("model proposed no usable steps")
    return out


def gemini_propose(goal: str, memories: list[dict], name: str, today: date,
                   generate: Callable | None = None) -> list[dict]:
    if generate is None:
        from services.gemini import SCHEMAS, generate_for

        def generate(prompt):
            return generate_for("action", prompt, SCHEMAS["action"]["steps"], timeout_ms=10000)
    result = generate(proposal_prompt(goal, memories, name, today))
    return ground_steps((result or {}).get("steps"), goal, memories, today)


def gemini_enabled() -> bool:
    import os
    if os.environ.get("ACTION_GEMINI") == "0":
        return False
    try:
        from services import gemini
        gemini._load_env()
    except Exception:
        return False
    return bool(os.environ.get("GEMINI_API_KEY", "").strip())


def _phrase_routine(group: dict) -> str:
    when = group["weekday"] + ("s" if group.get("hour") is None else f"s around {group['hour']}:00")
    return f"{group['content']} on {when}"


def _keyword(goal: str) -> str:
    activity = _activity(goal)
    if activity:
        return activity
    words = [word for word in re.findall(r"[a-z0-9]+", goal.lower()) if word not in {"a", "the", "on", "this"}]
    return words[0] if words else goal.lower()


_NOT_TOPICAL = {"a", "an", "the", "on", "at", "in", "to", "for", "my", "me", "with", "this",
                "next", "week", "today", "tonight", "tomorrow", "want", "would", "like", "please"}
_NOTE_MAX = 90  # characters per quoted memory; the note sits in a small card


def _topic_words(goal: str) -> set[str]:
    return {w for w in re.findall(r"[a-z]+", goal.lower()) if len(w) > 2 and w not in _NOT_TOPICAL}


def _relevance(memory: dict, topics: set[str]) -> int:
    words = re.findall(r"[a-z]+", str(memory.get("content", "")).lower())
    # Prefix match so "bowl" finds "bowling" and "call" finds "calls".
    return sum(1 for t in topics if any(w.startswith(t) or t.startswith(w) and len(w) > 3 for w in words))


def _shorten(text: str) -> str:
    text = " ".join(text.split()).rstrip(" .;")
    if len(text) <= _NOTE_MAX:
        return text
    cut = text[:_NOTE_MAX].rsplit(" ", 1)[0].rstrip(" ,;—-")
    return cut + "…"


def _memory_phrase(memory: dict) -> str:
    content = _shorten(str(memory.get("content", "")))
    label = memory.get("label")
    if memory.get("source") == "resident":
        # The resident's own words: quoted as saved, never reworded.
        return f'{label or "In their words"}: "{content}."'
    return f"{label}: {content}." if label else f"{content}."


def _note_floor() -> float:
    # Same floor the memory server uses (mcp/retrieval.py MIN_SCORE).
    import os
    return float(os.environ.get("RAG_MIN_SCORE", "0.63"))


def _by_meaning(hits: list[dict]) -> list[dict]:
    """Memories the server ranked by meaning for this goal, best first. The
    server lets a weak semantic hit through on a keyword boost ("haircut next
    week" -> "weekly phone calls"); the note only quotes hits whose own
    similarity clears the floor. A hit with no embedding yet keeps its place."""
    floor = _note_floor()
    return [m for m in hits
            if m.get("status") not in ("pending", "rejected", "dismissed")
            and (m.get("similarity") is None or m["similarity"] >= floor)]


def _by_words(usable: list[dict], goal: str) -> list[dict]:
    """Fallback when there is no meaning-ranked recall: shared words."""
    topics = _topic_words(goal)
    scored = [(_relevance(m, topics), i, m) for i, m in enumerate(usable)]
    return [m for score, _i, m in sorted(scored, key=lambda x: (-x[0], x[1])) if score > 0]


def _retriever_note(raw: list[dict] | None, usable: list[dict], goal: str = "",
                    goal_hits: list[dict] | None = None) -> str:
    if raw is None:
        return "Could not reach saved memories right now."
    relevant = _by_meaning(goal_hits) if goal_hits is not None else _by_words(usable, goal)
    if not relevant:
        return "Nothing saved about this yet."
    # One memory is usually enough; add a second only if it comes from a different source.
    picked = [relevant[0]]
    second = next((m for m in relevant[1:] if m.get("source") != relevant[0].get("source")), None)
    if second:
        picked.append(second)
    return " ".join(_memory_phrase(m) for m in picked)


def _routine_note(events: list[dict] | None, keyword: str) -> str:
    from agents.memory.routines import find_routines

    if events is None:
        return "Could not read the outing record right now."
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
        return "No regular pattern yet."
    found = find_routines(rows, phrase=_phrase_routine)
    if not found:
        return "No regular pattern yet."
    top = found[0]
    return f"{top['content']}, {top['count']} times recently."


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


def agent_notes(name: str, goal: str, memories: list[dict] | None, events: list[dict] | None, plan: dict,
                goal_hits: list[dict] | None = None) -> list[dict]:
    """What the choice screen shows beside the approval card.
    goal_hits: the memory server's recall for the goal itself, ranked by
    meaning. Without it the note falls back to shared words."""
    # Rank the whole recall, not just the retriever's top 5,
    # so a matching memory further down the list is not cut off.
    usable = [m for m in (memories or []) if m.get("status") not in ("pending", "rejected", "dismissed")]
    return [
        {"id": "observer", "name": "Observer", "note": f"{name} chose {goal.strip()}."},
        {"id": "retriever", "name": "Retriever",
         "note": _retriever_note(memories, usable, goal, goal_hits)},
        {"id": "routine", "name": "Routine finder", "note": _routine_note(events, _keyword(goal))},
        {"id": "action", "name": "Action", "note": _action_note(plan.get("steps") or [])},
    ]


def plan_with_notes(goal: str, *, name: str, memories: list[dict] | None, events: list[dict] | None,
                    goal_hits: list[dict] | None = None, **plan_kwargs) -> dict:
    usable = _usable(memories)
    plan = build_plan(goal, usable, **plan_kwargs)
    plan["agents"] = agent_notes(name, goal, memories, events, plan, goal_hits)
    return plan


_RECALL_WAIT_SECONDS = 8
_EVENTS_WAIT_SECONDS = 8
_PROPOSE_WAIT_SECONDS = 12


async def propose_plan(resident_id: str, goal: str, *, name: str) -> dict:
    """Recall through MCP, build the plan, and attach the four agent notes.
    A down server is named on that note. The plan still uses the catalog.
    Each lookup is bounded so a hung server cannot leave the choice waiting."""
    import asyncio

    from services import mcp_client

    memories: list[dict] | None
    events: list[dict] | None
    goal_hits: list[dict] | None = None
    seen: dict = {}
    reached = False
    for query in (goal, "usual time", "family sister contact"):
        try:
            payload = await asyncio.wait_for(
                mcp_client.recall(resident_id, query), _RECALL_WAIT_SECONDS
            )
        except Exception as exc:
            print(f"[action] retriever skipped ({type(exc).__name__}): {exc}")
            continue
        reached = True
        found = payload.get("memories", []) if isinstance(payload, dict) else []
        if query == goal:
            goal_hits = list(found)  # ranked by meaning, best first: the note quotes these
        for memory in found:
            if memory.get("status") not in ("pending", "rejected", "dismissed"):
                seen[memory.get("id", memory.get("content"))] = memory
    memories = list(seen.values()) if reached else None
    if not reached:
        goal_hits = None

    try:
        significant = await asyncio.wait_for(
            mcp_client.get_significant_events(resident_id), _EVENTS_WAIT_SECONDS
        )
        events = list(significant.get("events") or [])
    except Exception as exc:
        print(f"[action] routine finder skipped ({type(exc).__name__}): {exc}")
        events = None

    propose = None
    if gemini_enabled():
        today = date.today()
        try:
            # Off the event loop; grounding happens inside, the rules cover any failure.
            steps = await asyncio.wait_for(
                asyncio.to_thread(gemini_propose, goal, _usable(memories), name, today),
                _PROPOSE_WAIT_SECONDS,
            )
            propose = lambda _goal, _memories: steps  # noqa: E731
        except Exception as exc:
            print(f"[action] Gemini proposer failed, using rules ({type(exc).__name__}): {exc}")
    return plan_with_notes(goal, name=name, memories=memories, events=events,
                           goal_hits=goal_hits, propose=propose)

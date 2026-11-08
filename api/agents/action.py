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

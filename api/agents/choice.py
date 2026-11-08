"""Supported Choice (BUILD_PLAN T3.6).

One short consequence line per option. The model never recommends and never
writes a price. Code subtracts the cost from the weekly budget and appends
that sentence. "not decided yet" is always one of the options.
"""

from __future__ import annotations

import os
import re
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

from services.gemini import SCHEMAS

NOT_DECIDED = "not decided yet"
SEED_BUDGETS = {"marcus": 40.0, "dana": 60.0}
_MODEL_WAIT_SECONDS = 2.5
_POOL = ThreadPoolExecutor(max_workers=2, thread_name_prefix="choice")

_WORD = re.compile(r"[a-z0-9]+")
_REJECT = re.compile(r"\$|\b(should|recommend|recommends|recommended|better|best)\b", re.I)
_SKIP = {"not", "decided", "yet", "a", "an", "the"}

_SYSTEM = (
    "Write one short neutral line for each option. "
    "Do not recommend, compare, or rank them. "
    "Do not write prices, dollars, or money left. "
    "Include the option called not decided yet, and let the person wait. "
    "Use periods and commas. Never use an em dash, an en dash, or a double hyphen."
)


def _is_undecided(label: str) -> bool:
    key = " ".join(label.replace("_", " ").split()).lower()
    return key in {"not decided yet", "not yet decided"}


def _money(amount: float) -> str:
    number = round(float(amount), 2)
    if number == int(number):
        return f"${int(number)}"
    return f"${number:.2f}"


def money_left(weekly_budget: float | None, cost: float) -> float | None:
    if weekly_budget is None:
        return None
    return round(float(weekly_budget) - float(cost), 2)


def money_sentence(cost: float, weekly_budget: float | None) -> str:
    """Same arithmetic as web/lib/format.ts consequence()."""
    cost_line = f"Costs {_money(cost)}."
    left = money_left(weekly_budget, cost)
    if left is None:
        return cost_line
    if left >= 0:
        return f"{cost_line} {_money(left)} left this week."
    return f"{cost_line} {_money(abs(left))} over this week."


def _fallback_phrase(label: str) -> str:
    if _is_undecided(label):
        return "That's okay. We can come back to this."
    return f"You would choose {label}."


def _mentions(phrase: str, label: str) -> bool:
    tokens = [word for word in _WORD.findall(label.lower()) if word not in _SKIP]
    blob = phrase.lower()
    return all(word in blob for word in tokens)


def _acceptable(phrase: str, label: str, others: list[str]) -> bool:
    line = " ".join((phrase or "").split())
    if not line or _REJECT.search(line):
        return False
    if _is_undecided(label):
        if any(_mentions(line, other) for other in others):
            return False
        return "okay" in line.lower() or "come back" in line.lower()
    return _mentions(line, label)


def prepare_options(resident_id: str, options: list[dict]) -> list[dict]:
    """Keep the caller's options and add 'not decided yet' when it is missing."""
    resident = (resident_id or "").strip().lower()
    prepared: list[dict] = []
    seen: set[str] = set()
    for raw in options or []:
        label = " ".join(str(raw.get("label") or "").split())
        if not label:
            continue
        if _is_undecided(label):
            label = NOT_DECIDED
        key = label.lower()
        if key in seen:
            continue
        seen.add(key)
        cost = 0.0 if _is_undecided(label) else float(raw.get("cost") or 0)
        photo = raw.get("photo") or None
        if _is_undecided(label) and not photo:
            photo = f"tiles/{resident}_later"
        prepared.append({"label": label, "photo": photo, "cost": cost})
    if NOT_DECIDED not in seen:
        prepared.append({
            "label": NOT_DECIDED,
            "photo": f"tiles/{resident}_later",
            "cost": 0.0,
        })
    return prepared


def _prompt(question: str, options: list[dict]) -> str:
    lines = [f"Question: {question}", "Options, in this order:"]
    for option in options:
        lines.append(f"- {option['label']}")
    lines.append("Write one line per option, in the same order. Do not add an option.")
    return "\n".join(lines)


def _phrases_from_model(raw: object, options: list[dict]) -> dict[str, str]:
    rows = raw.get("options") if isinstance(raw, dict) else None
    if not isinstance(rows, list):
        return {}
    by_label = {option["label"].lower(): option["label"] for option in options}
    others = [option["label"] for option in options]
    kept: dict[str, str] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        label = " ".join(str(row.get("label") or "").split())
        canonical = by_label.get(label.lower())
        phrase = " ".join(str(row.get("consequence") or "").split())
        if not canonical or canonical.lower() in {key.lower() for key in kept}:
            continue
        siblings = [name for name in others if name.lower() != canonical.lower()]
        if _acceptable(phrase, canonical, siblings):
            kept[canonical] = phrase
    return kept


def _ask_model(caller, prompt: str):
    def run():
        return caller(
            prompt,
            SCHEMAS["choice"]["consequences"],
            system=_SYSTEM,
            attempts=1,
        )

    future = _POOL.submit(run)
    try:
        return future.result(timeout=_MODEL_WAIT_SECONDS)
    except FuturesTimeout:
        print("[choice] model exceeded 2.5s")
        return None
    except AssertionError:
        raise
    except Exception as exc:
        print(f"[choice] {type(exc).__name__}: model skipped")
        return None


def build_choice(
    *,
    resident_id: str,
    question: str,
    options: list[dict],
    weekly_budget: float | None,
    generate=None,
) -> dict:
    """Return the question, budget, and options with coded money lines.

    generate=None uses the local phrases. generate="auto" calls Gemini and
    keeps a line only when it is neutral. Tests pass a fake generate.
    """
    prepared = prepare_options(resident_id, options)
    question = " ".join((question or "").split())
    phrases: dict[str, str] = {}
    if generate is not None:
        caller = generate
        if generate == "auto":
            if os.environ.get("GEMINI_API_KEY", "").strip():
                from services.gemini import generate_json

                caller = generate_json
            else:
                caller = None
        if caller is not None:
            raw = _ask_model(caller, _prompt(question, prepared))
            if raw is not None:
                phrases = _phrases_from_model(raw, prepared)

    built = []
    for option in prepared:
        phrase = phrases.get(option["label"]) or _fallback_phrase(option["label"])
        if not phrase.endswith("."):
            phrase = f"{phrase}."
        cost = float(option["cost"])
        built.append({
            "label": option["label"],
            "photo": option["photo"],
            "cost": cost,
            "money_left": money_left(weekly_budget, cost),
            "consequence": f"{phrase} {money_sentence(cost, weekly_budget)}",
        })
    budget = None if weekly_budget is None else float(weekly_budget)
    return {"question": question, "weekly_budget": budget, "options": built}

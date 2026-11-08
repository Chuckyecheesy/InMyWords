"""T4.6 wiring: Gemini adapters, MCP adapters, and the two entry points the
API calls. Everything here is best effort. A memory failure must never break
a route, and nothing is spoken or saved as the resident's words.
"""

import asyncio

from agents.memory.consolidator import consolidate
from agents.memory.observer import observe
from agents.memory.routines import find_routines
from services import mcp_client

_CANDIDATES_SCHEMA = {
    "type": "object",
    "properties": {
        "candidates": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "type": {"type": "string", "enum": ["preference", "event", "routine"]},
                    "content": {"type": "string"},
                    "evidence": {"type": "string"},
                    "topic": {"type": "string"},
                },
                "required": ["type", "content", "evidence", "topic"],
            },
        }
    },
    "required": ["candidates"],
}
_YES_NO_SCHEMA = {
    "type": "object",
    "properties": {"contradicts": {"type": "boolean"}},
    "required": ["contradicts"],
}
_PHRASE_SCHEMA = {
    "type": "object",
    "properties": {"sentence": {"type": "string"}},
    "required": ["sentence"],
}


def _gemini():
    from services import gemini  # imported late: needs the API key only when used
    return gemini


def gemini_extract(prompt: str) -> dict:
    return _gemini().generate_for("memory", prompt, _CANDIDATES_SCHEMA)


def gemini_contradicts(candidate: dict, memory: dict) -> bool:
    """True only when the new fact and the old one cannot both be current.
    Any failure answers False: no flag is better than a wrong flag."""
    # Types are not compared: the model may call tea a routine while the binder
    # calls coffee a preference. Same topic is judged by the prompt below.
    prompt = (
        "A care team holds an old fact about a person. A new observation may mean "
        "the old fact is out of date and should be re-checked with the person.\n"
        f"Old fact: {memory.get('content', '')}\n"
        f"New observation: {candidate.get('content', '')}\n"
        'Answer {"contradicts": true} if the new observation is about the same '
        "topic and suggests a change (for example: old says coffee, new says now "
        'picks tea). Answer {"contradicts": false} if they are about different '
        "things or simply agree."
    )
    for attempt in (1, 2):  # one retry: a failed check would hide a real change
        try:
            return bool(_gemini().generate_for("memory_easy", prompt, _YES_NO_SCHEMA).get("contradicts"))
        except Exception as exc:
            print(f"[memory] contradiction check failed (try {attempt}): {exc}")
    return False


def plain_routine_text(group: dict) -> str:
    when = group["weekday"] + ("s" if group.get("hour") is None else f"s around {group['hour']}:00")
    return f"{group['content']} on {when}"


def gemini_phrase(group: dict) -> str:
    """Gemini phrases; the count and day come from code and are not asked for."""
    fallback = plain_routine_text(group)
    try:
        out = _gemini().generate_for("memory_easy",
            "Write one short plain sentence, no numbers, in the third person using 'they' (never 'I' or 'my', and never 'he' or 'she'), "
            f"describing this routine noticed by staff: {fallback}",
            _PHRASE_SCHEMA)
        return str(out.get("sentence", "")).strip() or fallback
    except Exception as exc:
        print(f"[memory] phrasing failed: {exc}")
        return fallback


# ---- MCP adapters: map the modules' names onto services/mcp_client ----

def _run(coro):
    return asyncio.run(coro)  # called from a worker thread, never the event loop


def mcp_recall(resident_id, query, **_):
    # broad: the consolidator needs every on-topic memory to check for contradictions
    return _run(mcp_client.recall(resident_id, query, broad=True)).get("memories", [])


def mcp_remember(resident_id, type, content, source, **_):
    return _run(mcp_client.remember(resident_id, content, source=source, mem_type=type))


def mcp_propose(resident_id, memory_id, reason):
    return _run(mcp_client.propose_update(resident_id, memory_id, reason))


def _consolidate(record: dict, resident_id: str, *, recall, remember, propose, contradicts):
    return consolidate(
        record, resident_id=resident_id, recall=recall, contradicts=contradicts,
        remember=remember, propose_update=propose)


def observe_sync(text: str, kind: str, resident_id: str, *, extract=gemini_extract,
                 recall=mcp_recall, remember=mcp_remember, propose=mcp_propose,
                 contradicts=gemini_contradicts) -> list[dict]:
    return observe(
        text, kind=kind, resident_id=resident_id, extract=extract,
        remember=lambda **record: _consolidate(
            record, resident_id, recall=recall, remember=remember,
            propose=propose, contradicts=contradicts))


async def observe_event(text: str, kind: str, resident_id: str) -> None:
    """Fire and forget from a route. Never raises."""
    try:
        await asyncio.to_thread(observe_sync, text, kind, resident_id)
    except Exception as exc:
        print(f"[memory] observer skipped ({type(exc).__name__}): {exc}")


def scan_routines_sync(resident_id: str, events: list[dict], *, phrase=gemini_phrase,
                       recall=mcp_recall, remember=mcp_remember, propose=mcp_propose,
                       contradicts=lambda c, m: False) -> list[dict]:
    """Suggest routines seen 3+ times. They enter the confirm queue as pending
    'pattern noticed' items, or add to a memory that already exists."""
    rows = [{"content": e["event"], "at": e["date"]} for e in events]
    results = []
    for found in find_routines(rows, phrase=phrase):
        candidate = {"type": "routine", "content": found["content"],
                     "source": "inferred", "evidence": f"seen {found['count']} times",
                     "topic": found["content"].split()[0]}
        outcome = _consolidate(candidate, resident_id, recall=recall, remember=remember,
                               propose=propose, contradicts=contradicts)
        results.append({**found, "action": outcome["action"]})
    return results


async def scan_routines(resident_id: str) -> list[dict]:
    data = await mcp_client.get_significant_events(resident_id)
    return await asyncio.to_thread(scan_routines_sync, resident_id, data["events"])

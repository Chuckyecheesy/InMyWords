"""Observer (T4.6). Turns one sentence, choice, observation or EMH note into
candidate memories. The model proposes; this module decides what is saved.

A candidate is kept only when its evidence is quoted from the input. Staff
observations are saved as staff; everything else is inferred. Nothing is
ever saved as the resident's words.
"""

import re

_TYPES = {"preference", "event", "routine"}
_MIN_QUOTE = 8
_WS = re.compile(r"\s+")


def _flat(text: str) -> str:
    return _WS.sub(" ", str(text)).strip().casefold()


def observation_prompt(text: str, kind: str) -> str:
    return (
        f"Read this {kind} about a resident in supported living.\n"
        "Extract only what it states. Never invent a fact or a quote.\n"
        "Return JSON only: "
        '{"candidates": [{"type": "preference" | "event" | "routine", '
        '"content": "one plain sentence", "evidence": "verbatim quote"}]}\n'
        "Leave candidates empty if nothing fits.\n\n"
        f"Input:\n{text}"
    )


def observe(text: str, *, kind: str, resident_id: str, extract, remember) -> list[dict]:
    source = "staff" if kind == "observation" else "inferred"
    raw = extract(observation_prompt(text, kind))
    items = raw.get("candidates", []) if isinstance(raw, dict) else raw
    if not isinstance(items, list):
        return []
    haystack = _flat(text)
    saved: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        mem_type = str(item.get("type", "")).strip().lower()
        content = str(item.get("content", "")).strip()
        evidence = str(item.get("evidence", "")).strip()
        quote = _flat(evidence)
        if mem_type not in _TYPES or not content:
            continue
        if len(quote) < _MIN_QUOTE or quote not in haystack:
            continue
        record = {
            "resident_id": resident_id.strip(),
            "type": mem_type,
            "content": content,
            "source": source,
            "evidence": evidence,
        }
        remember(**record)
        saved.append(record)
    return saved

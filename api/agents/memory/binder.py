"""Binder import (T4.2).

Gemini may propose facts. This module decides what is allowed to be saved.
A fact is kept only when its evidence is a quote from the document. Source,
status, and date are set here: document, pending, and the binder's own date.
Nothing imported is marked as the resident's words.
"""

import re
from datetime import datetime

class BinderError(Exception):
    pass


_UPDATE_LINE = re.compile(r"Last full update:\s*([A-Za-z]+ \d{1,2}, \d{4})")
_WHITESPACE = re.compile(r"\s+")
_FACT_TYPES = {"preference", "event", "routine"}
_MIN_QUOTE = 20

_PROMPT_RULES = """Extract only what the document states.
Never invent a fact, a date, or a quote.
Keep this document's date on every fact: {document_date}.
Do not mark any fact as the resident's words or as confirmed.
Each fact needs a verbatim quote from the document."""


def parse_document_date(text: str) -> str | None:
    """The binder date is the 'Last full update' line, not a later mention."""
    match = _UPDATE_LINE.search(text)
    if not match:
        return None
    try:
        found = datetime.strptime(match.group(1), "%B %d, %Y")
    except ValueError:
        return None
    return found.date().isoformat()


def extraction_prompt(document_text: str, document_date: str) -> str:
    rules = _PROMPT_RULES.format(document_date=document_date)
    return (
        "You are reading a resident's paper binder for a supported-living home.\n"
        f"{rules}\n"
        "Return JSON only, with this shape:\n"
        '{"facts": [{"type": "preference" | "event" | "routine", '
        '"content": "one plain sentence", "evidence": "verbatim quote"}]}\n'
        "Leave facts empty if the document does not state anything in those three types.\n\n"
        "Document:\n"
        f"{document_text}"
    )


def _flat(text: str) -> str:
    text = (
        text.replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("**", "")
    )
    return _WHITESPACE.sub(" ", text).strip().casefold()


def _fact_list(raw: object) -> list:
    if isinstance(raw, dict):
        if "facts" not in raw:
            raise BinderError("Extraction did not return a list of facts.")
        raw = raw["facts"]
    if not isinstance(raw, list):
        raise BinderError("Extraction did not return a list of facts.")
    return raw


def normalize_facts(raw: object, *, document_text: str, document_date: str) -> list[dict]:
    document = _flat(document_text)
    kept: list[dict] = []
    for item in _fact_list(raw):
        if not isinstance(item, dict):
            continue
        fact_type = str(item.get("type", "")).strip().lower()
        content = str(item.get("content", "")).strip()
        evidence = str(item.get("evidence", "")).strip()
        quote = _flat(evidence)
        if fact_type not in _FACT_TYPES or not content:
            continue
        if len(quote) < _MIN_QUOTE or quote not in document:
            continue
        kept.append(
            {
                "type": fact_type,
                "content": content,
                "source": "document",
                "source_date": document_date,
                "status": "pending",
                "evidence": evidence,
            }
        )
    return kept


def import_binder(document_text: str, *, resident_id: str, extract, remember) -> list[dict]:
    """Save each kept fact through remember. extract is the model call."""
    document_date = parse_document_date(document_text)
    if not document_date:
        raise BinderError(
            "This document has no 'Last full update' date, so nothing was saved."
        )
    raw = extract(extraction_prompt(document_text, document_date))
    facts = normalize_facts(
        raw, document_text=document_text, document_date=document_date
    )
    saved: list[dict] = []
    resident = resident_id.strip()
    for fact in facts:
        record = {"resident_id": resident, **fact}
        remember(**record)
        saved.append(record)
    return saved

"""Tile builder (T4.2). Plain code: the checker's report + the staff label ->
what happens next. No model calls here.
"""

import re

MAX_LABEL_WORDS = 3
_SPACE = re.compile(r"\s+")


def clean_label(label: str) -> str:
    """Tiles show a short word, lower case like the seed tiles ('coffee')."""
    text = _SPACE.sub(" ", str(label or "")).strip().strip(".!?,").lower()
    return " ".join(text.split(" ")[:MAX_LABEL_WORDS])


def decide(label: str, check: dict | None, existing_tiles: list[dict], *, confirmed: bool) -> dict:
    """Return {"action": "save" | "review", ...}.

    review: the photo seems not to match the label, is unclear, or raises a
    privacy concern, and staff have not confirmed yet. Staff see why and
    choose: save anyway, or change the label / photo.
    save: category from the checker, else the existing tile's, else "things".
    """
    label = clean_label(label)
    if not label:
        return {"action": "error", "reason": "Type what the photo shows."}
    same = next((t for t in existing_tiles if str(t.get("label", "")).lower() == label), None)
    reasons = []
    if check is not None and not confirmed:
        if not check["matches_label"]:
            reasons.append(f'The photo looks like "{check["shows"]}", not "{label}".')
        if not check["clear"]:
            reasons.append("The main subject is hard to see.")
        if check["concern"]:
            reasons.append(check["concern"])
    category = ((check or {}).get("category")
                or (same or {}).get("category") or "things")
    out = {"label": label, "category": category, "replaces": bool(same),
           "checked": check is not None,
           "shows": (check or {}).get("shows")}
    if reasons:
        return {"action": "review", "reasons": reasons, **out}
    return {"action": "save", **out}

"""Photo checker (T4.2). Gemini looks at one staff photo and describes it.

The model reports; it never decides. tiler.py turns the report into save /
needs-review using plain rules, and a failed check never blocks staff: the
photo is saved with their label and marked "not checked".
"""

# Same categories as the seed tiles, so a new tile sorts with the others.
CATEGORIES = ["activities", "answers", "feelings", "food & drink", "people", "places", "things"]

SCHEMA = {
    "type": "object",
    "properties": {
        "shows": {"type": "string"},          # 1-4 plain words: what is in the photo
        "matches_label": {"type": "boolean"},
        "category": {"type": "string", "enum": CATEGORIES},
        "clear": {"type": "boolean"},          # one main subject, not too dark or blurry
        "concern": {"type": "string"},         # "" or a short privacy/safety note
    },
    "required": ["shows", "matches_label", "category", "clear", "concern"],
}


def check_prompt(label: str) -> str:
    return (
        "This photo was taken by support staff to become a picture tile that a "
        "non-verbal resident taps to communicate.\n"
        f'Staff labelled it: "{label}".\n'
        "Describe only what you can see. Return JSON:\n"
        '- "shows": 1 to 4 plain words for the main subject.\n'
        '- "matches_label": true if a person tapping a tile called '
        f'"{label}" would recognise this photo as that.\n'
        f'- "category": one of {", ".join(CATEGORIES)}.\n'
        '- "clear": true if there is one main subject that is easy to see.\n'
        '- "concern": empty, or a short note if the photo shows private '
        "information (documents, screens, addresses) or another person's face.\n"
        "Never guess who a person is."
    )


def check_photo(image: bytes, mime: str, label: str, *, generate) -> dict:
    """`generate(prompt, schema, images)` -> dict. Raises on failure; the
    wiring treats a failure as 'not checked'."""
    out = generate(check_prompt(label), SCHEMA, [(image, mime)])
    category = out.get("category")
    return {
        "shows": str(out.get("shows", "")).strip()[:60],
        "matches_label": bool(out.get("matches_label")),
        "category": category if category in CATEGORIES else None,
        "clear": bool(out.get("clear")),
        "concern": str(out.get("concern", "")).strip()[:200],
    }

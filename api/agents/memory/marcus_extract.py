"""Deterministic Marcus binder extraction for offline verify / seed.

Only emits facts whose evidence is a verbatim quote from marcus_binder.md.
When GEMINI_API_KEY is set, prefer Gemini structured output instead.
"""

from __future__ import annotations

# Quotes copied character-for-character from db/seed/marcus_binder.md.
MARCUS_BINDER_FACTS = [
    {
        "type": "preference",
        "content": "Breakfast drink is a coffee double-double from Tim Hortons",
        "evidence": (
            'his order is a coffee, double cream double sugar ("double-double") '
            "from Tim Hortons"
        ),
    },
    {
        "type": "routine",
        "content": "Bowling on Saturday afternoon is the anchor of his week",
        "evidence": "Saturday afternoon is bowling. This is the anchor of his week.",
    },
    {
        "type": "preference",
        "content": "Loves the Toronto Raptors and watches every televised game",
        "evidence": "The Toronto Raptors. Watches every televised game.",
    },
    {
        "type": "preference",
        "content": "Sister Lisa is his primary contact",
        "evidence": "Lisa (sister) — primary contact. Calls Sunday evenings; visits monthly.",
    },
    {
        "type": "preference",
        "content": "Loud echoing rooms upset him; he covers his ears and tries to leave",
        "evidence": (
            "Loud, echoing rooms: food courts, gyms, school assemblies. "
            "He will cover his ears, then try to leave."
        ),
    },
    {
        "type": "routine",
        "content": "Hot drink with breakfast around 7:30",
        "evidence": "Hot drink with breakfast at about 7:30",
    },
]


def marcus_binder_extract(_prompt: str) -> dict:
    """Return only facts that the binder states, with verbatim evidence."""
    return {"facts": [dict(fact) for fact in MARCUS_BINDER_FACTS]}

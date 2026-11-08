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
        "evidence": "Lisa (sister), primary contact. Calls Sunday evenings; visits monthly.",
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
    {
        "type": "preference",
        "content": (
            "Marcus communicates with single words, gestures, and picture cards; "
            "speak normally, not slowly"
        ),
        "evidence": (
            "He communicates with single words, gestures, and a small set of "
            "picture cards kept in the kitchen drawer. He understands far more "
            "than he says, speak to him normally, not slowly."
        ),
    },
    {
        "type": "preference",
        "content": (
            "When overwhelmed, Marcus covers his ears and looks for the door; "
            "give him space and somewhere quiet"
        ),
        "evidence": (
            "When that happens he covers his ears and looks for the door. "
            "Do not crowd him; give him space and somewhere quiet."
        ),
    },
    {
        "type": "routine",
        "content": "Day program Monday to Friday; pickup is at 8:45",
        "evidence": "Day program Monday to Friday, picked up at 8:45.",
    },
    {
        "type": "routine",
        "content": (
            "Listens to music in his room most evenings, using over-ear headphones"
        ),
        "evidence": "Listens to music in his room most evenings, over-ear headphones.",
    },
    {
        "type": "preference",
        "content": "Being rushed through breakfast is difficult for Marcus",
        "evidence": "Being rushed through breakfast.",
    },
    {
        "type": "preference",
        "content": "Last-minute changes to Saturday plans upset Marcus",
        "evidence": "Last-minute changes to Saturday plans.",
    },
    {
        "type": "preference",
        "content": "Prefers a left-side window seat on bus rides",
        "evidence": "Bus rides, window seat, left side.",
    },
]


def marcus_binder_extract(_prompt: str) -> dict:
    """Return only facts that the binder states, with verbatim evidence."""
    return {"facts": [dict(fact) for fact in MARCUS_BINDER_FACTS]}

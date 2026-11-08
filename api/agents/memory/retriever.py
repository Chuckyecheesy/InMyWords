"""Retriever (T4.6). Top memories for Voice, Coach, Action and Handoff.
Dismissed memories are never returned; status and source stay on each one so
callers can label them honestly."""


def retrieve(resident_id: str, query: str, *, recall, limit: int = 5) -> list[dict]:
    found = recall(resident_id=resident_id, query=query) or []
    kept = [m for m in found if m.get("status") != "dismissed"]
    return kept[:limit]

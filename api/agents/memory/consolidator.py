"""Consolidator (T4.6). Decides what a candidate memory does to the store.

A contradiction with a confirmed memory is only proposed to the resident
(propose_update); nothing is overwritten. A close match is seen again; the
memory server bumps times_seen. Anything else is remembered as a candidate.
"""


def consolidate(candidate: dict, *, resident_id: str, recall, contradicts,
                remember, propose_update, threshold: float = 0.9,
                max_checks: int = 3) -> dict:
    # Recall is hybrid (semantic + keyword). The general topic ("drinks") still
    # goes first: it helps the keyword half and keeps the topic in the first few
    # words. The caller's recall should be broad (see wiring.mcp_recall) so a
    # near-duplicate on top doesn't crowd out the memory it contradicts.
    query = f"{candidate.get('topic', '')} {candidate['content']}".strip()
    found = recall(resident_id=resident_id, query=query) or []

    confirmed = [m for m in found if m.get("status") == "confirmed"][:max_checks]
    for memory in confirmed:  # each check may be a model call, so it is capped
        if contradicts(candidate, memory):
            reason = (
                f"New pattern noticed: {candidate['content']} "
                f"(earlier: {memory.get('content', '')})"
            )
            propose_update(resident_id=resident_id, memory_id=memory["id"], reason=reason)
            return {"action": "proposed_update", "memory_id": memory["id"]}

    def save():
        remember(resident_id=resident_id, **{
            k: candidate[k] for k in ("type", "content", "source", "evidence")
            if k in candidate})

    for memory in found:
        if memory.get("similarity", 0) >= threshold:
            save()  # server bumps times_seen on a near-duplicate
            return {"action": "seen_again", "memory_id": memory["id"]}

    save()
    return {"action": "remembered"}

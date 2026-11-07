"""resident-profile MCP server (BUILD_PLAN T2.3) — 8 tools.

Run:  python mcp/profile_server.py          (streamable HTTP on :8101)

Every returned fact includes source and date. suggest_sentence returns
neutral placeholders until Ahmed's Voice agent prompt lands (T3.2) —
same output shape, so nothing downstream changes.
"""

from fastmcp import FastMCP

from store import get_store, source_label

mcp = FastMCP("resident-profile")


def _facts(memories, name):
    return [{
        "content": m["content"],
        "source": m["source"],
        "date": m.get("source_date") or str(m["last_seen"])[:10],
        "status": m["status"],
        "label": source_label(m["source"], name, m.get("source_date") or str(m["last_seen"])[:10]),
    } for m in memories]


@mcp.tool
def get_profile(resident: str) -> dict:
    """Routines, likes/dislikes, goals and communication style for a resident.
    The profile is the confirmed memory store; pending patterns are listed
    separately and must never be shown as fact."""
    store = get_store()
    r = store.get_resident(resident)
    if not r:
        return {"error": f"no resident '{resident}'"}
    name = r["first_name"]
    confirmed = _facts(store.get_memories(resident, ("confirmed",)), name)
    pending = _facts(store.get_memories(resident, ("pending",)), name)
    return {
        "resident": resident,
        "name": name,
        "voice_id": r.get("voice_id"),
        "communication_style": r.get("communication_style"),
        "weekly_budget": float(r["weekly_budget"]) if r.get("weekly_budget") is not None else None,
        "tiles": r["tiles"],
        "preferences": [f for f in confirmed if any(
            m["content"] == f["content"] and m["type"] == "preference"
            for m in store.get_memories(resident, ("confirmed",)))],
        "routines": [f for f in confirmed if any(
            m["content"] == f["content"] and m["type"] == "routine"
            for m in store.get_memories(resident, ("confirmed",)))],
        "recent_events": [f for f in confirmed if any(
            m["content"] == f["content"] and m["type"] == "event"
            for m in store.get_memories(resident, ("confirmed",)))],
        "pending_patterns": pending,
        "store_mode": store.mode,
    }


@mcp.tool
def get_story(resident: str) -> dict:
    """Story chapters with text, photos, narration audio and approval status."""
    store = get_store()
    return {"resident": resident, "chapters": store.get_story(resident), "store_mode": store.mode}


@mcp.tool
def save_story_chapter(resident: str, chapter: str, text: str, photos: list[str] | None = None) -> dict:
    """Save a draft story chapter (status=draft until the resident approves it)."""
    store = get_store()
    chapter_id = store.save_story_chapter(resident, chapter, text, photos or [])
    return {"chapter_id": chapter_id, "status": "draft", "store_mode": store.mode}


@mcp.tool
def ask_about(resident: str, question: str) -> dict:
    """Retrieval only — returns matching facts with source + date + label.
    William's Coach agent does the wording; if facts is empty the Coach
    must answer 'I don't know, ask <name>'."""
    store = get_store()
    r = store.get_resident(resident)
    name = r["first_name"] if r else resident
    hits = store.search_facts(resident, question)
    for h in hits:
        h["label"] = source_label(h["source"] if h["status"] != "pending" else "inferred", name, h["date"])
    return {"resident": resident, "question": question, "facts": hits,
            "unknown": len(hits) == 0, "store_mode": store.mode}


@mcp.tool
def suggest_sentence(resident: str, tiles: list[str], time_of_day: str = "") -> dict:
    """2-3 sentence options for the tapped tiles.
    PLACEHOLDER until Ahmed's Voice agent (T3.2) plugs in — neutral,
    faithful-to-tiles templates only. Output shape is final."""
    phrase = " ".join(tiles)
    options = [f"I want {phrase}.", f"Can I have {phrase}, please?"]
    if len(tiles) > 1:
        options.append(f"{tiles[0].capitalize()} first, then {' '.join(tiles[1:])}?")
    return {"options": options[:3], "agent": "placeholder-until-T3.2"}


@mcp.tool
def log_sentence(resident: str, sentence: str, approved: bool, tiles: list[str] | None = None) -> dict:
    """Record a spoken (or rejected) sentence. approved=False is still logged —
    rejections teach the memory layer too."""
    store = get_store()
    sentence_id = store.log_sentence(resident, tiles or [], sentence, approved)
    return {"id": sentence_id, "store_mode": store.mode}


@mcp.tool
def log_choice(resident: str, options: list[dict], chosen: str | None = None, question: str = "") -> dict:
    """Record a choice. chosen=None means 'not decided yet' — there is NO
    'staff decided' path, by design."""
    store = get_store()
    status = "chosen" if chosen else "not_yet_decided"
    choice_id = store.log_choice(resident, question, options, chosen, status)
    return {"id": choice_id, "status": status, "store_mode": store.mode}


@mcp.tool
def get_observations(resident: str, since: str = "") -> dict:
    """Staff observations for a resident, optionally since an ISO timestamp.
    (Additive read tool — the Handoff agent needs it.)"""
    store = get_store()
    rows = store.get_observations(resident, since or None)
    return {"observations": [{"staff": o["staff_id"], "note": o["note"],
                              "date": str(o["created_at"])[:10]} for o in rows]}


@mcp.tool
def get_choices(resident: str, since: str = "") -> dict:
    """Choices with status, optionally since an ISO timestamp.
    (Additive read tool — the Handoff agent needs it.)"""
    store = get_store()
    rows = store.get_choices(resident, since or None)
    return {"choices": [{"chosen": c["chosen"], "status": c["status"],
                         "question": c.get("question"), "date": str(c["created_at"])[:10]}
                        for c in rows]}


@mcp.tool
def add_observation(resident: str, staff: str, note: str) -> dict:
    """Save a staff observation — stored separately from the resident's words,
    never overwrites them."""
    store = get_store()
    obs_id = store.add_observation(resident, staff, note)
    return {"id": obs_id, "source": "staff", "store_mode": store.mode}


if __name__ == "__main__":
    mcp.run(transport="http", host="127.0.0.1", port=8101)

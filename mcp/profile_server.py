"""resident-profile MCP server (BUILD_PLAN T2.3), 8 tools.

Run:  python mcp/profile_server.py          (streamable HTTP on :8101)

Every returned fact includes source and date. suggest_sentence calls the
sentence writer in api/agents/voice.py (text only, same output shape).
"""

from fastmcp import FastMCP

from store import get_store, source_label, visit_view

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
    # Fetch once: this used to re-query confirmed memories once per fact per
    # section (~26 round trips to Tiger Data, ~7-10 s per profile).
    confirmed_rows = store.get_memories(resident, ("confirmed",))
    confirmed = _facts(confirmed_rows, name)
    pending = _facts(store.get_memories(resident, ("pending",)), name)
    typed = {(m["content"], m["type"]) for m in confirmed_rows}
    return {
        "resident": resident,
        "name": name,
        "voice_id": r.get("voice_id"),
        "communication_style": r.get("communication_style"),
        "weekly_budget": float(r["weekly_budget"]) if r.get("weekly_budget") is not None else None,
        "tiles": r["tiles"],
        "preferences": [f for f in confirmed if (f["content"], "preference") in typed],
        "routines": [f for f in confirmed if (f["content"], "routine") in typed],
        "recent_events": [f for f in confirmed if (f["content"], "event") in typed],
        "pending_patterns": pending,
        "store_mode": store.mode,
    }


@mcp.tool
def get_story(resident: str) -> dict:
    """Story chapters with text, photos, narration audio and approval status."""
    store = get_store()
    return {"resident": resident, "chapters": store.get_story(resident), "store_mode": store.mode}


def _answer_row(row: dict) -> dict:
    created = row.get("created_at")
    return {
        "id": row.get("id"),
        "resident_id": row.get("resident_id"),
        "chapter": row.get("chapter_key") or row.get("chapter"),
        "question": row.get("question"),
        "answer": row.get("answer"),
        "created_at": str(created) if created else None,
    }


@mcp.tool
def save_story_answer(resident: str, chapter: str, question: str, answer: str) -> dict:
    """Save one picture-interview answer. Does not approve or narrate the chapter."""
    store = get_store()
    if not store.get_resident(resident):
        return {"error": f"no resident '{resident}'"}
    answer_id = store.save_story_answer(resident, chapter, question, answer)
    return {"ok": True, "id": answer_id, "store_mode": store.mode}


@mcp.tool
def get_story_answers(resident: str, chapter: str = "") -> dict:
    """Interview answers for a resident, oldest first. Optional chapter key."""
    store = get_store()
    if not store.get_resident(resident):
        return {"error": f"no resident '{resident}'"}
    rows = store.get_story_answers(resident, chapter or None)
    return {"answers": [_answer_row(row) for row in rows], "store_mode": store.mode}


def _chapter_row(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "resident_id": row.get("resident_id"),
        "chapter": row.get("chapter_key") or row.get("chapter"),
        "text": row.get("text"),
        "status": row.get("status") or "draft",
        "audio_url": row.get("audio_url"),
        "photo_ids": row.get("photo_ids") or [],
    }


@mcp.tool
def get_story_chapter(chapter_id: int) -> dict:
    """One chapter, including draft text. audio_url is empty until the resident approves."""
    store = get_store()
    row = store.get_chapter(int(chapter_id))
    if not row:
        return {"error": f"no chapter '{chapter_id}'"}
    return {"chapter": _chapter_row(row), "store_mode": store.mode}


@mcp.tool
def approve_story_chapter(chapter_id: int, audio_url: str) -> dict:
    """Mark a draft approved and store the narration URL. Call only after a yes."""
    store = get_store()
    row = store.approve_story_chapter(int(chapter_id), audio_url)
    if not row:
        return {"error": f"no chapter '{chapter_id}'"}
    return {"chapter": _chapter_row(row), "store_mode": store.mode}


@mcp.tool
def save_story_chapter(resident: str, chapter: str, text: str, photos: list[str] | None = None) -> dict:
    """Save a draft story chapter (status=draft until the resident approves it)."""
    store = get_store()
    chapter_id = store.save_story_chapter(resident, chapter, text, photos or [])
    return {"chapter_id": chapter_id, "status": "draft", "store_mode": store.mode}


@mcp.tool
def ask_about(resident: str, question: str) -> dict:
    """Retrieval only, returns matching facts with source + date + label.
    William's Coach agent does the wording; if facts is empty the Coach
    must answer 'I don't know, ask <name>'."""
    store = get_store()
    r = store.get_resident(resident)
    name = r["first_name"] if r else resident
    hits = store.search_facts(resident, question)
    for h in hits:
        # Only inferred facts read as "pattern noticed" while pending. Binder
        # facts keep "From records" even when flagged for a re-check.
        pending_inferred = h["status"] == "pending" and h["source"] in ("inferred", "pattern")
        h["label"] = source_label("inferred" if pending_inferred else h["source"], name, h["date"])
    return {"resident": resident, "question": question, "facts": hits,
            "unknown": len(hits) == 0, "store_mode": store.mode}


def _suggest_with_voice(resident: str, tiles: list[str], time_of_day: str) -> dict:
    import sys
    from pathlib import Path

    api = str(Path(__file__).resolve().parents[1] / "api")
    if api not in sys.path:
        sys.path.insert(0, api)
    from agents.voice import suggest

    store = get_store()
    resident_row = store.get_resident(resident)
    name = resident_row["first_name"] if resident_row else resident
    memories = store.recall(resident, " ".join(tiles))
    return suggest(
        resident_id=resident,
        name=name,
        tiles=tiles,
        time_of_day=time_of_day,
        memories=memories,
        generate=None,
    )


@mcp.tool
def suggest_sentence(resident: str, tiles: list[str], time_of_day: str = "") -> dict:
    """2-3 written sentences for the tapped tiles. No audio.
    Mock-first local compose (same as the API when SUGGEST_USE_LLM is off).
    Personalizes from confirmed memories without calling Gemini."""
    try:
        return _suggest_with_voice(resident, tiles, time_of_day)
    except Exception as exc:
        print(f"[suggest_sentence fallback] {type(exc).__name__}: {exc}")
        phrase = " ".join(tiles)
        options = [f"I want {phrase}.", f"Can I have {phrase}, please?"]
        if len(tiles) > 1:
            options.append(f"{tiles[0].capitalize()} first, then {' '.join(tiles[1:])}?")
        return {"options": options[:3]}


@mcp.tool
def log_sentence(resident: str, sentence: str, approved: bool, tiles: list[str] | None = None) -> dict:
    """Record a spoken (or rejected) sentence. approved=False is still logged , 
    rejections teach the memory layer too."""
    store = get_store()
    sentence_id = store.log_sentence(resident, tiles or [], sentence, approved)
    return {"id": sentence_id, "store_mode": store.mode}


@mcp.tool
def log_choice(resident: str, options: list[dict], chosen: str | None = None, question: str = "") -> dict:
    """Record a choice. chosen=None means 'not decided yet', there is NO
    'staff decided' path, by design."""
    store = get_store()
    status = "chosen" if chosen else "not_yet_decided"
    choice_id = store.log_choice(resident, question, options, chosen, status)
    return {"id": choice_id, "status": status, "store_mode": store.mode}


@mcp.tool
def get_observations(resident: str, since: str = "") -> dict:
    """Staff observations for a resident, optionally since an ISO timestamp.
    (Additive read tool, the Handoff agent needs it.)"""
    store = get_store()
    rows = store.get_observations(resident, since or None)
    return {"observations": [{"staff": o["staff_id"], "note": o["note"],
                              "date": str(o["created_at"])[:10]} for o in rows]}


@mcp.tool
def get_choices(resident: str, since: str = "") -> dict:
    """Choices with status, optionally since an ISO timestamp.
    (Additive read tool, the Handoff agent needs it.)"""
    store = get_store()
    rows = store.get_choices(resident, since or None)
    return {"choices": [{"chosen": c["chosen"], "status": c["status"],
                         "question": c.get("question"), "date": str(c["created_at"])[:10]}
                        for c in rows]}


@mcp.tool
def add_record(resident: str, title: str, body: str, category: str = "update",
               author: str = "", doc_date: str = "") -> dict:
    """Records library (ROADMAP Phase 3): add a document or dated staff
    update. Append-only; never overwrites older records. Facts from records
    surface in ask_about with 'From records' labels, never as the
    resident's words."""
    allowed = ("binder", "care plan", "update", "medical", "other")
    if category not in allowed:
        return {"error": f"category must be one of {allowed}"}
    if not title.strip() or not body.strip():
        return {"error": "title and body are required"}
    store = get_store()
    doc = store.add_document(resident, title.strip(), category, author or None,
                             doc_date or None, body.strip())
    return {"id": doc["id"], "title": doc["title"], "store_mode": store.mode}


@mcp.tool
def get_records(resident: str) -> dict:
    """The resident's records library, newest document date first."""
    store = get_store()
    docs = store.get_documents(resident)
    return {"resident": resident,
            "records": [{"id": d["id"], "title": d["title"], "category": d["category"],
                         "author": d.get("author"), "doc_date": str(d.get("doc_date") or "") or None,
                         "uploaded_at": str(d.get("uploaded_at") or "")[:10],
                         "body": d["body"]} for d in docs],
            "store_mode": store.mode}


@mcp.tool
def add_observation(resident: str, staff: str, note: str) -> dict:
    """Save a staff observation, stored separately from the resident's words,
    never overwrites them."""
    store = get_store()
    obs_id = store.add_observation(resident, staff, note)
    return {"id": obs_id, "source": "staff", "store_mode": store.mode}


@mcp.tool
def save_tile(resident: str, label: str, cloudinary_id: str, category: str = "") -> dict:
    """Staff photo -> picture tile (T4.2). A tile with the same label gets the
    new photo instead of a duplicate. Additive tool; the photo agent calls it
    only after its checks (and staff confirmation when the photo looked wrong)."""
    label = (label or "").strip()
    cloudinary_id = (cloudinary_id or "").strip().strip("/")
    if not label or not cloudinary_id:
        return {"error": "a tile needs a label and a cloudinary_id"}
    store = get_store()
    if not store.get_resident(resident):
        return {"error": f"unknown resident '{resident}'"}
    tile, replaced = store.save_tile(resident, label, category.strip() or None, cloudinary_id)
    return {"resident": resident, "tile": tile, "replaced": replaced, "store_mode": store.mode}


# ---- My Planner (PROJECT_PLAN §2.5) ----


def _routine_blocks(resident, staff, start_time, length_min, days, start_date):
    """Shared checks + plain-code expansion. Returns (resident_row, blocks, error)."""
    from datetime import datetime
    from zoneinfo import ZoneInfo

    from calendar_core import DEFAULT_TZ, expand_routine

    store = get_store()
    r = store.get_resident(resident)
    if not r:
        return None, None, {"error": f"unknown resident '{resident}'"}
    if not store.get_staff(staff):
        return None, None, {"error": f"unknown staff '{staff}'"}
    start_date = start_date or datetime.now(ZoneInfo(DEFAULT_TZ)).date().isoformat()
    try:
        return r, expand_routine(start_date, start_time, length_min, days=days, tz=DEFAULT_TZ), None
    except ValueError as exc:
        return None, None, {"error": str(exc)}


@mcp.tool
def preview_routine(resident: str, staff: str, start_time: str, length_min: int,
                    days: list[str] | None = None, start_date: str | None = None) -> dict:
    """What a routine would look like on the week, for the approval card.
    WRITES NOTHING (rule 1): the routine is saved only after the resident
    approves it."""
    _, blocks, err = _routine_blocks(resident, staff, start_time, length_min, days, start_date)
    if err:
        return err
    return {"resident": resident, "staff": staff,
            "visits": [{"staff": staff, **b} for b in blocks]}


@mcp.tool
def save_routine(resident: str, staff: str, start_time: str, length_min: int,
                 days: list[str] | None = None, start_date: str | None = None) -> dict:
    """The resident's routine ("meet Sam at 13:00 for 120 minutes", every day by
    default) expanded into one visit block per day for a week. Plain code does
    the time maths. Nothing is booked: every visit waits for the approval card."""
    from calendar_core import WEEKDAYS

    r, blocks, err = _routine_blocks(resident, staff, start_time, length_min, days, start_date)
    if err:
        return err
    store = get_store()
    routine, visits = store.create_routine(resident, staff, start_time, int(length_min),
                                           list(days) if days else list(WEEKDAYS), "resident", blocks)
    return {"routine_id": routine["id"], "resident": resident,
            "visits": [visit_view(v, r["first_name"]) for v in visits]}


@mcp.tool
def get_planner(resident: str) -> dict:
    """Every visit block for the resident, earliest first, plus the staff
    the resident can choose to see."""
    store = get_store()
    r = store.get_resident(resident)
    if not r:
        return {"error": f"unknown resident '{resident}'"}
    visits = sorted(store.get_visits(rid=resident), key=lambda v: v["starts_at"])
    staff = [{"id": s["id"], "name": s["name"]} for s in store.list_staff() if s.get("role") == "staff"]
    return {"resident": resident, "visits": [visit_view(v, r["first_name"]) for v in visits],
            "staff": staff}


@mcp.tool
def set_tile_archived(resident: str, tile_id: int, archived: bool = True) -> dict:
    """Custom cards (ROADMAP Phase 4): hide a card from the resident's grid,
    or restore it. Archived cards are never deleted, so undo always works."""
    store = get_store()
    ok = store.set_tile_archived(resident, tile_id, archived)
    if not ok:
        return {"error": f"no tile {tile_id} for '{resident}'"}
    return {"ok": True, "tile_id": tile_id, "archived": archived, "store_mode": store.mode}


@mcp.tool
def get_auth_user(login_id: str) -> dict:
    """Accounts (ROADMAP Phase 2): look up a login row by resident id or staff
    email. Returns the PBKDF2 hash for the API to verify; never a raw secret.
    This server stays internal (localhost) — the API is the sole gatekeeper."""
    store = get_store()
    user = store.get_user(login_id)
    if not user:
        return {"error": f"no user '{login_id}'"}
    return {"user": user, "store_mode": store.mode}


@mcp.tool
def list_resident_logins() -> dict:
    """The shared-tablet sign-in grid: residents who can log in (id + display
    name only; no hashes)."""
    store = get_store()
    return {"residents": store.list_resident_logins(), "store_mode": store.mode}


@mcp.tool
def get_staff_assignments(staff_id: str) -> dict:
    """Which residents a staff member supports. Scope rule: staff see assigned
    residents only; managers see all; residents see themselves."""
    store = get_store()
    return {"resident_ids": store.get_assignments(staff_id), "store_mode": store.mode}


@mcp.tool
def create_resident(resident_id: str, first_name: str, home_id: str = "",
                    communication_style: str = "", weekly_budget: float | None = None,
                    secret_hash: str = "", staff_ids: list[str] | None = None,
                    tiles: list[dict] | None = None) -> dict:
    """Create-a-resident (staff): resident row + starter tiles + photo/PIN
    login + staff assignments. Everything staff enters stays staff-provided
    until the resident confirms it through the normal memory-confirm flow."""
    store = get_store()
    result = store.create_resident({
        "id": resident_id, "first_name": first_name, "home_id": home_id or None,
        "communication_style": communication_style, "weekly_budget": weekly_budget,
        "secret_hash": secret_hash, "staff_ids": staff_ids or [], "tiles": tiles or []})
    if isinstance(result, dict) and result.get("error"):
        return result
    return {"resident": result, "store_mode": store.mode}


if __name__ == "__main__":
    mcp.run(transport="http", host="127.0.0.1", port=8101)

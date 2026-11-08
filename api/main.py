"""In My Words — backend API (BUILD_PLAN §6, contracts in docs/CONTRACTS.md).

T2.4 state: resident/story/sentence/observation/choice-decide/coach-ask
routes call the MCP servers via services/mcp_client.py, and FALL BACK to
mock JSON when a server isn't running — so the frontend never breaks.
Everything else stays mocked until the owning agent lands.

Run the stack:
    python mcp/profile_server.py        # :8101
    python mcp/emh_server.py            # :8104
    uvicorn main:app --reload           # :8000  (works alone too, mocks-only)
"""

import asyncio
import json
import os
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import mocks
from agents.action import propose_plan
from agents.choice import SEED_BUDGETS, build_choice
from agents.coach_wording import coach_answer, select_facts
from agents.memory.wiring import observe_event, scan_routines
from agents.photos.wiring import add_photo_tile
from agents.story import LocalBooks, McpBooks, StoryError, local_books, narrate, record_answer, draft as draft_chapter
from agents.story import gemini_phrase
from agents.voice import clean_tiles, load_seed_memories, suggest as suggest_sentences
from services import elevenlabs, mcp_client
from services.narration import public_audio_url
from speak_for_me import speak_approved
from services.limits import allow
from services.cloudinary import (
    CloudinaryConfigError,
    PublicIdError,
    photo_record,
    save_photo_record,
    unsigned_upload_params,
)


async def _mcp(coro, fallback):
    """Try the MCP path; fall back to mock JSON if the server is down."""
    try:
        return await coro, True
    except Exception as exc:
        print(f"[mcp fallback] {type(exc).__name__}: {exc}")
        return fallback, False

app = FastAPI(title="In My Words API", version="0.1.0-mocks")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # hackathon setting; tighten if we ever go past demo
    allow_methods=["*"],
    allow_headers=["*"],
)

# Generated speech (services/elevenlabs.py cache), served as /audio/<hash>.mp3
elevenlabs.CACHE_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/audio", StaticFiles(directory=elevenlabs.CACHE_DIR), name="audio")


# ---------- request bodies (inputs frozen at hour 1) ----------

class VoiceBody(BaseModel):
    voice_id: str

class SuggestBody(BaseModel):
    resident_id: str
    tiles: list[str]
    time: str | None = None

class SpeakBody(BaseModel):
    resident_id: str
    text: str

class SentenceBody(BaseModel):
    resident_id: str
    tiles: list[str]
    chosen_text: str
    approved: bool

class StoryAnswerBody(BaseModel):
    resident_id: str
    chapter: str
    question: str
    answer: str

class StoryDraftBody(BaseModel):
    resident_id: str
    chapter: str

class StoryApproveBody(BaseModel):
    chapter_id: int

class CoachAskBody(BaseModel):
    resident_id: str
    question: str

class ChoiceOption(BaseModel):
    label: str
    photo: str | None = None
    cost: float = 0

class ChoicesBody(BaseModel):
    resident_id: str
    question: str
    options: list[ChoiceOption]

class DecideBody(BaseModel):
    chosen: str  # a label, or "not_yet_decided"

class ActionPlanBody(BaseModel):
    resident_id: str
    goal: str

class ConfirmBody(BaseModel):
    confirmed: bool  # yes/no
    resident_id: str = "marcus"  # additive; scopes the memory lookup

class ObservationBody(BaseModel):
    resident_id: str
    staff_id: str
    note: str

class PhotoBody(BaseModel):
    resident_id: str
    public_id: str
    label: str | None = None
    confirmed: bool = False  # staff chose "save anyway" after a needs_review


# ---------- residents ----------

def resident_from_profile(resident_id: str, profile):
    """Turn a profile-tool result into the public resident body.

    Returns ("missing", message) when the resident does not exist, (body, None)
    when the payload is usable, and (None, None) when it is not — the route
    then serves the demo resident instead of answering 500.
    """
    if not isinstance(profile, dict):
        return None, None
    error = profile.get("error")
    if error:
        return "missing", str(error)
    name = profile.get("name")
    tiles = profile.get("tiles")
    if not isinstance(name, str) or not name.strip() or not isinstance(tiles, list):
        return None, None
    return {
        "id": resident_id,
        "name": name,
        "voice_id": profile.get("voice_id"),
        "communication_style": profile.get("communication_style") or "",
        "tiles": tiles,
        # extra context beyond the frozen contract — additive, safe
        "preferences": profile.get("preferences") or [],
        "routines": profile.get("routines") or [],
        "pending_patterns": profile.get("pending_patterns") or [],
    }, None


@app.get("/residents/{resident_id}")
async def get_resident(resident_id: str):
    profile, live = await _mcp(mcp_client.get_profile(resident_id), None)
    if live:
        body, missing = resident_from_profile(resident_id, profile)
        if body == "missing":
            raise HTTPException(404, missing or f"No resident '{resident_id}'")
        if body:
            return body
    resident = mocks.RESIDENTS.get(resident_id)
    if not resident:
        raise HTTPException(404, f"No resident '{resident_id}'")
    return resident


@app.put("/residents/{resident_id}/voice")
def set_voice(resident_id: str, body: VoiceBody):
    # /speak uses it right away. TODO(T2): persist to residents.voice_id via MCP.
    elevenlabs.set_resident_voice(resident_id, body.voice_id)
    return {"ok": True}


@app.get("/voices/{resident_id}")
def voice_options(resident_id: str, request: Request):
    """Additive (not in the frozen table): the 3 designed voices for the voice picker."""
    entry = elevenlabs.load_voices().get(resident_id)
    if not entry:
        return {"current": elevenlabs.resident_voice(resident_id), "options": []}
    return {
        "current": elevenlabs.resident_voice(resident_id),
        "options": [
            {"voice_id": o["voice_id"], "label": o["label"], "preview_text": o["preview_text"],
             "preview_url": public_audio_url(request, o["preview_file"])}
            for o in entry["options"]
        ],
    }


# ---------- Speak For Me ----------

@app.post("/suggest")
async def suggest(body: SuggestBody, request: Request):
    """Tile tap → 2–3 written sentences. Audio is POST /speak, after approval."""
    host = request.client.host if request.client else "local"
    if not allow(f"suggest:{host}"):
        raise HTTPException(429, "Too many suggestions. Wait a moment.")
    tiles = clean_tiles(body.tiles)
    resident_id = "".join(ch for ch in body.resident_id if ch.isalnum() or ch in "_-")[:40]
    recalled, live = await _mcp(
        mcp_client.recall(resident_id, " ".join(tiles)), None)
    # Seed file only when the memory server FAILED. An empty result is a real
    # answer (nothing relevant to these tiles) and must not swap in stale seed
    # data for the live database.
    if live and isinstance(recalled, dict):
        memories = recalled.get("memories", [])
    else:
        memories = load_seed_memories(resident_id)
    profile, profile_live = await _mcp(mcp_client.get_profile(resident_id), None)
    if profile_live and isinstance(profile, dict) and profile.get("name"):
        name = profile["name"]
    else:
        name = resident_id[:1].upper() + resident_id[1:] if resident_id else "Resident"
    # Mock-first: local compose (generate=None). Live Gemini only when
    # SUGGEST_USE_LLM=1 — flip that after the mock path demos cleanly.
    use_llm = os.environ.get("SUGGEST_USE_LLM", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }
    try:
        return suggest_sentences(
            resident_id=resident_id,
            name=name,
            tiles=tiles,
            time_of_day=body.time or "",
            memories=memories,
            generate="auto" if use_llm else None,
        )
    except Exception as exc:
        print(f"[suggest fallback] {type(exc).__name__}: {exc}")
    result, tool_live = await _mcp(
        mcp_client.suggest_sentence(resident_id, tiles, body.time or ""), None)
    if tool_live:
        return {"options": result["options"]}
    return {"options": mocks.SUGGESTIONS.get(resident_id, mocks.SUGGESTIONS["marcus"])}


@app.post("/speak")
async def speak(body: SpeakBody, request: Request):
    """Approved text → audio in the resident's voice (T1.2).

    Call ONLY after the resident approved the text (approval card ✅).
    "Speak tiles only" is the same call with text = the tile words joined,
    e.g. "coffee now"; no AI involved. Cached by voice_id + text.
    """
    return await speak_approved(request, body.resident_id, body.text)


@app.get("/agents/{kind}/session")
async def agent_session(kind: str):
    """Additive: a signed URL to start a Story (T1.4) or Coach (T1.6) voice session."""
    if kind not in elevenlabs.AGENTS:
        raise HTTPException(404, f"No agent '{kind}'")
    agent = elevenlabs.agent_id(kind)
    if not agent or not elevenlabs.configured():
        raise HTTPException(503, "The voice guide isn't set up yet.")
    try:
        return {"signed_url": await elevenlabs.signed_url(agent)}
    except elevenlabs.ElevenLabsError as exc:
        print(f"[agent session] {exc}")
        raise HTTPException(502, "Couldn't start the voice guide right now.") from exc


@app.post("/sentences")
async def log_sentence(body: SentenceBody, background: BackgroundTasks):
    result, live = await _mcp(
        mcp_client.log_sentence(body.resident_id, body.chosen_text, body.approved, body.tiles), None)
    if body.approved:  # nothing unapproved is ever learned from
        background.add_task(observe_event, body.chosen_text, "sentence", body.resident_id)
    return {"id": result["id"]} if live else {"id": 9001}


# ---------- My Story ----------

async def _story_books():
    """Profile server when it answers, otherwise the in-process books."""
    try:
        await mcp_client.get_story("marcus")
    except Exception as exc:
        print(f"[story books] {type(exc).__name__}: {exc}")
        return local_books
    return McpBooks()


@app.post("/story/answer")
async def story_answer(body: StoryAnswerBody):
    books = await _story_books()
    try:
        return await record_answer(books, body.resident_id, body.chapter, body.question, body.answer)
    except StoryError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get("/story/{resident_id}/answers")
async def get_story_answers(resident_id: str, chapter: str = ""):
    books = await _story_books()
    if isinstance(books, LocalBooks):
        rows = [row for row in books.rows
                if row["resident_id"] == resident_id and (not chapter or row["chapter"] == chapter)]
        return {"answers": rows}
    result, live = await _mcp(mcp_client.get_story_answers(resident_id, chapter), None)
    if live:
        if result.get("error"):
            raise HTTPException(404, result["error"])
        return {"answers": result.get("answers", [])}
    return {"answers": []}


@app.post("/story/draft")
async def story_draft(body: StoryDraftBody):
    """Text only. Narration waits for /story/approve."""
    books = await _story_books()
    try:
        return await draft_chapter(books, body.resident_id, body.chapter, generate=gemini_phrase)
    except StoryError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/story/approve")
async def story_approve(body: StoryApproveBody, request: Request):
    """The resident said yes. This is the step that calls ElevenLabs."""
    books = await _story_books()
    try:
        spoken = await narrate(books, body.chapter_id)
    except StoryError as exc:
        raise HTTPException(422, str(exc)) from exc
    except elevenlabs.ElevenLabsError as exc:
        print(f"[story approve] {exc}")
        raise HTTPException(502, "Couldn't make the audio right now. The draft is still here.") from exc
    if spoken.get("filename"):
        audio_url = public_audio_url(request, spoken["filename"])
        await books.mark_approved(body.chapter_id, audio_url)
        return {"audio_url": audio_url, "cached": spoken["cached"]}
    return {"audio_url": spoken["audio_url"], "cached": spoken.get("cached", False)}


@app.get("/story/{resident_id}")
async def get_story(resident_id: str):
    result, live = await _mcp(mcp_client.get_story(resident_id), None)
    if live:
        return {"chapters": result["chapters"]}
    story = mocks.STORY.get(resident_id)
    if not story:
        raise HTTPException(404, f"No story for '{resident_id}'")
    return story


# ---------- Onboarding Coach ----------

@app.post("/coach/ask")
async def coach_ask(body: CoachAskBody):
    # Real retrieval via ask_about; William's Coach agent (T4.4) replaces the
    # naive wording below. Facts already carry correct source labels.
    result, live = await _mcp(mcp_client.ask_about(body.resident_id, body.question), None)
    if live:
        facts = result["facts"]
        if result["unknown"] or not facts:
            name = body.resident_id.capitalize()
            return {"answer": elevenlabs.normalize(f"I don't know. It's best to ask {name}."), "sources": []}
        name = body.resident_id.capitalize()
        chosen = select_facts(facts, name, body.question)
        return {
            "answer": elevenlabs.normalize(coach_answer(chosen, name, body.question)),
            "sources": [{"type": f["source"], "date": f["date"], "label": f["label"]} for f in chosen],
        }
    if "favourite colour" in body.question.lower():
        return mocks.COACH_ANSWERS["unknown"]
    return mocks.COACH_ANSWERS["default"]


# ---------- Supported Choice ----------

# Created choices, so decide can log the resident who actually tapped.
# The id from log_choice is used when the profile server is up.
_open_choices: dict[int, dict] = {}
_local_choice_ids = 0


def _next_choice_id() -> int:
    global _local_choice_ids
    _local_choice_ids += 1
    return _local_choice_ids


def _choice_budget(resident_id: str, profile: dict | None, live: bool) -> float | None:
    if live and isinstance(profile, dict) and not profile.get("error"):
        value = profile.get("weekly_budget")
        if value is not None:
            return float(value)
    return SEED_BUDGETS.get(resident_id.strip().lower())


def _chosen_label(raw: str, options: list[dict]) -> str | None:
    """A label from this choice, or None for 'not decided yet'."""
    text = " ".join((raw or "").replace("_", " ").split()).lower()
    if text in {"not decided yet", "not yet decided"}:
        return None
    for option in options:
        if option["label"].lower() == raw.strip().lower():
            if option["label"].lower() == "not decided yet":
                return None
            return option["label"]
    return raw.strip() or None


@app.post("/choices")
async def create_choice(body: ChoicesBody):
    resident_id = "".join(ch for ch in body.resident_id if ch.isalnum() or ch in "_-")[:40]
    profile, live = await _mcp(mcp_client.get_profile(resident_id), None)
    name = resident_id[:1].upper() + resident_id[1:] if resident_id else "Resident"
    if live and isinstance(profile, dict) and profile.get("name"):
        name = profile["name"]
    budget = _choice_budget(resident_id, profile if isinstance(profile, dict) else None, live)
    use_llm = bool(os.environ.get("GEMINI_API_KEY", "").strip())
    built = build_choice(
        resident_id=resident_id,
        question=body.question,
        options=[option.model_dump() for option in body.options],
        weekly_budget=budget,
        generate="auto" if use_llm else None,
    )
    logged, logged_live = await _mcp(
        mcp_client.log_choice(
            resident_id,
            options=built["options"],
            chosen=None,
            question=built["question"],
        ),
        None,
    )
    if logged_live and isinstance(logged, dict) and logged.get("id") is not None:
        choice_id = int(logged["id"])
    else:
        choice_id = _next_choice_id()
    _open_choices[choice_id] = {
        "resident_id": resident_id,
        "name": name,
        "question": built["question"],
        "options": built["options"],
    }
    return {
        "id": choice_id,
        "question": built["question"],
        "weekly_budget": built["weekly_budget"],
        "status": "not_yet_decided",
        "options": built["options"],
    }


@app.post("/choices/{choice_id}/decide")
async def decide_choice(choice_id: int, body: DecideBody, background: BackgroundTasks):
    row = _open_choices.get(choice_id)
    if row:
        chosen = _chosen_label(body.chosen, row["options"])
        result, live = await _mcp(
            mcp_client.log_choice(
                row["resident_id"],
                options=row["options"],
                chosen=chosen,
                question=row["question"],
            ),
            None,
        )
        status = result["status"] if live else ("chosen" if chosen else "not_yet_decided")
        if chosen:
            background.add_task(
                observe_event,
                f"{row['name']} chose {chosen}.",
                "choice",
                row["resident_id"],
            )
        return {"ok": True, "status": status}
    chosen = None if body.chosen == "not_yet_decided" else body.chosen
    return {"ok": True, "status": "chosen" if chosen else "not_yet_decided"}


# ---------- Actions ----------

@app.post("/actions/plan")
async def plan_actions(body: ActionPlanBody):
    profile, profile_live = await _mcp(mcp_client.get_profile(body.resident_id), None)
    name = body.resident_id[:1].upper() + body.resident_id[1:] if body.resident_id else "Resident"
    if profile_live and isinstance(profile, dict) and profile.get("name"):
        name = str(profile["name"]).split()[0]
    proposal = await propose_plan(body.resident_id, body.goal, name=name)
    result, live = await _mcp(
        mcp_client.save_plan(body.resident_id, body.goal, proposal["steps"]),
        None,
    )
    if not live or not isinstance(result, dict) or result.get("error"):
        # Older actions server, or it is down: keep the placeholder plan.
        result, live = await _mcp(mcp_client.plan_actions(body.resident_id, body.goal), None)
    if not live or not isinstance(result, dict) or result.get("error"):
        result = {
            "plan_id": mocks.ACTION_PLAN["plan_id"],
            "goal": body.goal,
            "online_steps": proposal["online_steps"],
            "staff_tasks": proposal["staff_tasks"],
            "total_cost": proposal["total_cost"],
            "status": "proposed",
        }
    planned = dict(result)
    planned["agents"] = proposal["agents"]
    planned["planner"] = proposal.get("planner", "rules")  # "gemini" or "rules" fallback
    return planned


@app.post("/actions/{plan_id}/approve")
async def approve_actions(plan_id: int, resident_id: str = "marcus"):
    # The gate lives in the actions server: only 'proposed' plans belonging
    # to this resident can be approved; steps run from the allowlist only
    # and every result is logged to action_results.
    result, live = await _mcp(mcp_client.approve_plan(resident_id, plan_id), None)
    return result if live else mocks.ACTION_RESULTS


@app.post("/actions/{plan_id}/cancel")
async def cancel_actions(plan_id: int, resident_id: str = "marcus"):
    result, live = await _mcp(mcp_client.cancel_plan(resident_id, plan_id), None)
    return result if live else {"plan_id": plan_id, "status": "cancelled"}


# ---------- My Planner (PROJECT_PLAN §2.5) ----------

class PlannerRoutineBody(BaseModel):
    resident_id: str
    person: str                       # staff id
    start: str                        # "13:00", local
    length_min: int
    days: list[str] | None = None     # default all 7
    start_date: str | None = None     # default today (Toronto)


class PlannerBookBody(BaseModel):
    resident_id: str
    routine_id: int
    approved: bool


class CalendarZipBody(BaseModel):
    resident_id: str = ""
    staff_id: str = ""
    calendar_zip_b64: str
    start_date: str = ""   # /planner/import: first day of the window shown
    days: int = 63


class CalendarCommitBody(BaseModel):
    staff_id: str
    import_id: str
    approved_ids: list[str]
    approved: bool


_PLANNER_DOWN = {"error": "The planner is not reachable right now. Nothing was booked."}


def _sync_call_tool():
    """call_tool for the sync Planner subagent, which runs in a worker thread:
    each MCP call is handed back to this event loop (where the sessions live)."""
    loop = asyncio.get_running_loop()

    def call(name: str, args: dict) -> dict:
        future = asyncio.run_coroutine_threadsafe(mcp_client.call_tool(name, args), loop)
        return future.result(timeout=30)
    return call


@app.post("/planner/preview")
async def planner_preview(body: PlannerRoutineBody):
    """The approval card's week preview. Saves nothing (rule 1)."""
    result, live = await _mcp(mcp_client.preview_routine(
        body.resident_id, body.person, body.start, body.length_min, body.days, body.start_date), None)
    return result if live else _PLANNER_DOWN


@app.post("/planner/routine")
async def planner_routine(body: PlannerRoutineBody):
    result, live = await _mcp(mcp_client.save_routine(
        body.resident_id, body.person, body.start, body.length_min, body.days, body.start_date), None)
    return result if live else _PLANNER_DOWN


@app.get("/planner/{resident_id}")
async def planner_week(resident_id: str):
    result, live = await _mcp(mcp_client.get_planner(resident_id), None)
    return result if live else {"resident": resident_id, "visits": [], "error": _PLANNER_DOWN["error"]}


@app.post("/planner/book")
async def planner_book(body: PlannerBookBody):
    """The resident approved the planner card. The Gemini Planner subagent
    writes the visits to Google Calendar through MCP; plain code finishes
    anything it could not. Visits stay booked in the app if Google is down."""
    from agents import planner
    try:
        return await asyncio.to_thread(
            planner.book_visits, body.resident_id, body.routine_id, body.approved,
            call_tool=_sync_call_tool(), run_tools=planner.default_run_tools())
    except Exception as exc:
        print(f"[planner] booking failed ({type(exc).__name__}): {exc}")
        return _PLANNER_DOWN


@app.post("/planner/import")
async def planner_import_view(body: CalendarZipBody):
    """Fallback: a staff .zip calendar export shown read-only on the grid."""
    result, live = await _mcp(mcp_client.import_calendar(
        body.resident_id, body.calendar_zip_b64, body.start_date, body.days), None)
    return result if live else _PLANNER_DOWN


@app.post("/planner/import/propose")
async def planner_import_propose(body: CalendarZipBody):
    result, live = await _mcp(mcp_client.propose_calendar_import(body.staff_id, body.calendar_zip_b64), None)
    return result if live else _PLANNER_DOWN


@app.post("/planner/import/commit")
async def planner_import_commit(body: CalendarCommitBody):
    from agents import planner
    try:
        return await asyncio.to_thread(
            planner.import_events, body.staff_id, body.import_id, body.approved_ids, body.approved,
            call_tool=_sync_call_tool(), run_tools=planner.default_run_tools())
    except Exception as exc:
        print(f"[planner] import failed ({type(exc).__name__}): {exc}")
        return {"error": "The calendar import could not run right now. Nothing was imported."}


# ---------- Memory ----------

@app.get("/memories/pending/{resident_id}")
async def pending_memories(resident_id: str):
    result, live = await _mcp(mcp_client.get_pending_memories(resident_id), None)
    if live:
        return {"memories": result["memories"]}
    return {"memories": mocks.PENDING_MEMORIES.get(resident_id, [])}


@app.post("/memories/routines/scan/{resident_id}")
async def scan_routine_patterns(resident_id: str):
    """Staff/demo trigger: group significant events by weekday, suggest 3+ as routines."""
    try:
        return {"routines": await scan_routines(resident_id)}
    except Exception as exc:
        print(f"[routines] scan failed: {exc}")
        raise HTTPException(503, "Couldn't look for routines right now.")


@app.post("/memories/{memory_id}/confirm")
async def confirm_memory(memory_id: int, body: ConfirmBody):
    result, live = await _mcp(
        mcp_client.confirm_memory(body.resident_id, memory_id, body.confirmed), None)
    if live and not result.get("error"):
        return {"ok": True, "memory": result["memory"], "now": result["now"]}
    return {"ok": True}


# ---------- Staff ----------

@app.get("/handoff")
async def handoff(staff_id: str, resident_id: str):
    from agents.handoff import build_handoff
    result, live = await _mcp(build_handoff(staff_id, resident_id), None)
    return result if live else mocks.HANDOFF


@app.get("/activity/{resident_id}")
async def activity(resident_id: str):
    result, live = await _mcp(mcp_client.get_activity(resident_id), None)
    if live:
        return {"items": result["items"]}
    return mocks.ACTIVITY.get(resident_id, {"items": []})


@app.post("/observations")
async def add_observation(body: ObservationBody, background: BackgroundTasks):
    result, live = await _mcp(
        mcp_client.add_observation(body.resident_id, body.staff_id, body.note), None)
    background.add_task(observe_event, body.note, "observation", body.resident_id)
    return {"ok": True, "id": result["id"]} if live else {"ok": True}


# ---------- Custom cards (ROADMAP Phase 4) ----------

class TileBody(BaseModel):
    resident_id: str
    label: str
    cloudinary_id: str
    category: str = ""


class TileArchiveBody(BaseModel):
    resident_id: str
    archived: bool = True


@app.post("/tiles")
async def add_tile(body: TileBody):
    """Resident-facing Add card: label + photo -> a tile on their grid."""
    result, live = await _mcp(
        mcp_client.save_tile(body.resident_id, body.label, body.cloudinary_id, body.category), None)
    if live and result.get("error"):
        raise HTTPException(422, result["error"])
    return {"ok": True, "tile": result.get("tile") if live else None}


@app.post("/tiles/{tile_id}/archive")
async def archive_tile(tile_id: int, body: TileArchiveBody):
    """Hide or restore a card. Never deletes, so undo always works."""
    result, live = await _mcp(
        mcp_client.set_tile_archived(body.resident_id, tile_id, body.archived), None)
    if live and result.get("error"):
        raise HTTPException(404, result["error"])
    return {"ok": True, "archived": body.archived}


# ---------- Records library (ROADMAP Phase 3) ----------

class RecordBody(BaseModel):
    resident_id: str
    title: str
    body: str
    category: str = "update"
    author: str = ""
    doc_date: str = ""


@app.post("/records")
async def add_record(body: RecordBody):
    """Append a document or dated staff update to the resident's records."""
    result, live = await _mcp(
        mcp_client.add_record(body.resident_id, body.title, body.body,
                              body.category, body.author, body.doc_date), None)
    if live and result.get("error"):
        raise HTTPException(422, result["error"])
    return {"ok": True, "id": result.get("id") if live else 0}


@app.get("/records/{resident_id}")
async def records(resident_id: str):
    result, live = await _mcp(mcp_client.get_records(resident_id), None)
    return {"records": result["records"]} if live else {"records": []}


# ---------- Gaze/gesture input (G5, GAZE_GESTURE_PLAN §7) ----------

class InputEvent(BaseModel):
    ts: str
    resident_id: str
    session_id: str | None = None
    input_type: str   # touch | gaze | gesture
    action: str       # select | approve | cancel | custom
    target: str | None = None
    hold_ms: int | None = None
    gesture: str | None = None
    confidence: float | None = None
    outcome: str      # confirmed | cancelled | timeout


class InputEventsBody(BaseModel):
    events: list[InputEvent]


@app.post("/input-events")
async def input_events(body: InputEventsBody):
    """Batched OUTCOME events from the browser input controller — never
    video, never raw gaze samples (frontend flushes every 2 s / 20 events)."""
    events = [e.model_dump() for e in body.events]
    result, live = await _mcp(mcp_client.log_input_events(events), None)
    return {"saved": result["saved"]} if live else {"saved": len(events)}


class CustomGestureBody(BaseModel):
    resident_id: str
    tile: str
    samples: list[list[float]]  # 5 × 63 normalized landmark floats


@app.post("/custom-gestures")
async def save_custom_gesture(body: CustomGestureBody):
    """G8: save a taught personal gesture (landmarks only, never video)."""
    result, live = await _mcp(
        mcp_client.save_custom_gesture(body.resident_id, body.tile, body.samples), None)
    if live and result.get("error"):
        raise HTTPException(422, result["error"])
    return {"ok": True, "tile": body.tile}


@app.get("/custom-gestures/{resident_id}")
async def custom_gestures(resident_id: str):
    result, live = await _mcp(mcp_client.get_custom_gestures(resident_id), None)
    return {"gestures": result["gestures"]} if live else {"gestures": []}


@app.get("/input-profile/{resident_id}")
async def input_profile(resident_id: str):
    """How this resident communicates best (adaptive settings + the
    'How I Communicate' Coach card). Labelled 'from input history'."""
    result, live = await _mcp(mcp_client.get_input_profile(resident_id), None)
    if live:
        result.pop("store_mode", None)
        return result
    return {"resident_id": resident_id, "preferred_select": "touch", "preferred_yes": "touch",
            "dwell_ms": 1000, "rates": {}, "notes": [], "events_counted": 0, "confidence": "low"}


# ---------- Photos (T4.2) ----------
# Not in the hour-1 contract table. Tell T2 before relying on these shapes.
# The id is held in memory until the tile row is saved through T2's API.

_photos: list[dict] = []


@app.get("/media/upload")
def media_upload():
    try:
        return unsigned_upload_params(os.environ)
    except CloudinaryConfigError as exc:
        raise HTTPException(503, str(exc)) from exc


@app.post("/media/photos")
async def save_photo(body: PhotoBody):
    """Staff photo -> picture tile, via the photo subagents (agents/photos).
    status: saved | needs_review (nothing saved until staff confirm) | error.
    Old fields (resident_id, cloudinary_id, label) stay for existing callers."""
    try:
        record = photo_record(
            resident_id=body.resident_id,
            public_id=body.public_id,
            label=body.label,
        )
    except PublicIdError as exc:
        raise HTTPException(400, str(exc)) from exc
    result, live = await _mcp(
        add_photo_tile(record["resident_id"], record["cloudinary_id"], record["label"] or "",
                       confirmed=body.confirmed), None)
    if not live:  # MCP down: keep the photo id so the upload isn't lost
        return {**save_photo_record(record, _photos), "status": "saved_offline",
                "reason": "Saved the photo, but it isn't a tile yet (profile server is down)."}
    if result["status"] == "error":
        raise HTTPException(400, result["reason"])
    return {**record, **result}


_VERSION_FILE = Path(__file__).resolve().parents[1] / "VERSION"  # written by ops/deploy.sh


@app.get("/")
def health():
    version = json.loads(_VERSION_FILE.read_text()) if _VERSION_FILE.exists() else {}
    return {"service": "in-my-words-api", "mode": "mocks", "docs": "/docs",
            "git_sha": version.get("git_sha"), "deployed_at": version.get("deployed_at")}

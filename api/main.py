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

import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import mocks
from services import mcp_client
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


# ---------- residents ----------

@app.get("/residents/{resident_id}")
async def get_resident(resident_id: str):
    profile, live = await _mcp(mcp_client.get_profile(resident_id), None)
    if live:
        if profile.get("error"):
            raise HTTPException(404, profile["error"])
        return {
            "id": resident_id,
            "name": profile["name"],
            "voice_id": profile["voice_id"],
            "communication_style": profile["communication_style"],
            "tiles": profile["tiles"],
            # extra context beyond the frozen contract — additive, safe
            "preferences": profile["preferences"],
            "routines": profile["routines"],
            "pending_patterns": profile["pending_patterns"],
        }
    resident = mocks.RESIDENTS.get(resident_id)
    if not resident:
        raise HTTPException(404, f"No resident '{resident_id}'")
    return resident


@app.put("/residents/{resident_id}/voice")
def set_voice(resident_id: str, body: VoiceBody):
    return {"ok": True}


# ---------- Speak For Me ----------

@app.post("/suggest")
async def suggest(body: SuggestBody):
    # MCP placeholder templates until Ahmed's Voice agent (T3.2) plugs in;
    # mock personalised lines if the server is down.
    result, live = await _mcp(
        mcp_client.suggest_sentence(body.resident_id, body.tiles, body.time or ""), None)
    if live:
        return {"options": result["options"]}
    return {"options": mocks.SUGGESTIONS.get(body.resident_id, mocks.SUGGESTIONS["marcus"])}


@app.post("/speak")
def speak(body: SpeakBody):
    # Real version (James, T1.2): ElevenLabs TTS cached by voice_id + text.
    return {"audio_url": f"https://example.com/audio/mock_{body.resident_id}.mp3"}


@app.post("/sentences")
async def log_sentence(body: SentenceBody):
    result, live = await _mcp(
        mcp_client.log_sentence(body.resident_id, body.chosen_text, body.approved, body.tiles), None)
    return {"id": result["id"]} if live else {"id": 9001}


# ---------- My Story ----------

@app.post("/story/answer")
def story_answer(body: StoryAnswerBody):
    return {"ok": True}


@app.post("/story/draft")
def story_draft(body: StoryDraftBody):
    return mocks.STORY_DRAFT


@app.post("/story/approve")
def story_approve(body: StoryApproveBody):
    return {"audio_url": "https://example.com/audio/mock_chapter.mp3"}


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
            return {"answer": f"I don't know — it's best to ask {name}.", "sources": []}
        top = facts[0]
        return {
            "answer": top["content"],
            "sources": [{"type": f["source"], "date": f["date"], "label": f["label"]} for f in facts[:3]],
        }
    if "favourite colour" in body.question.lower():
        return mocks.COACH_ANSWERS["unknown"]
    return mocks.COACH_ANSWERS["default"]


# ---------- Supported Choice ----------

@app.post("/choices")
def create_choice(body: ChoicesBody):
    return mocks.CHOICE_WITH_CONSEQUENCES


@app.post("/choices/{choice_id}/decide")
async def decide_choice(choice_id: int, body: DecideBody):
    chosen = None if body.chosen == "not_yet_decided" else body.chosen
    result, live = await _mcp(
        mcp_client.log_choice("marcus", options=[], chosen=chosen), None)
    # TODO(T2.5): look up the choice's resident + options by choice_id once
    # choices are persisted at creation time (they're created by Ahmed's agent).
    return {"ok": True, "status": result["status"] if live else ("chosen" if chosen else "not_yet_decided")}


# ---------- Actions ----------

@app.post("/actions/plan")
async def plan_actions(body: ActionPlanBody):
    result, live = await _mcp(mcp_client.plan_actions(body.resident_id, body.goal), None)
    return result if live else mocks.ACTION_PLAN


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


# ---------- Memory ----------

@app.get("/memories/pending/{resident_id}")
async def pending_memories(resident_id: str):
    result, live = await _mcp(mcp_client.get_pending_memories(resident_id), None)
    if live:
        return {"memories": result["memories"]}
    return {"memories": mocks.PENDING_MEMORIES.get(resident_id, [])}


@app.post("/memories/{memory_id}/confirm")
async def confirm_memory(memory_id: int, body: ConfirmBody):
    result, live = await _mcp(
        mcp_client.confirm_memory(body.resident_id, memory_id, body.confirmed), None)
    if live and not result.get("error"):
        return {"ok": True, "memory": result["memory"], "now": result["now"]}
    return {"ok": True}


# ---------- Staff ----------

@app.get("/handoff")
def handoff(staff_id: str, resident_id: str):
    return mocks.HANDOFF


@app.get("/activity/{resident_id}")
async def activity(resident_id: str):
    result, live = await _mcp(mcp_client.get_activity(resident_id), None)
    if live:
        return {"items": result["items"]}
    return mocks.ACTIVITY.get(resident_id, {"items": []})


@app.post("/observations")
async def add_observation(body: ObservationBody):
    result, live = await _mcp(
        mcp_client.add_observation(body.resident_id, body.staff_id, body.note), None)
    return {"ok": True, "id": result["id"]} if live else {"ok": True}


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
def save_photo(body: PhotoBody):
    try:
        record = photo_record(
            resident_id=body.resident_id,
            public_id=body.public_id,
            label=body.label,
        )
    except PublicIdError as exc:
        raise HTTPException(400, str(exc)) from exc
    return save_photo_record(record, _photos)


@app.get("/")
def health():
    return {"service": "in-my-words-api", "mode": "mocks", "docs": "/docs"}

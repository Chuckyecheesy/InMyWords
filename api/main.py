"""In My Words — backend API (BUILD_PLAN §6, contracts in docs/CONTRACTS.md).

T2.1 state: every endpoint returns hard-coded mock JSON from mocks.py so
James, Ahmed and William are unblocked. Replace each mock with real logic
(MCP calls via services/mcp_client.py) WITHOUT changing response shapes.

Run:  uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import mocks

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

class ObservationBody(BaseModel):
    resident_id: str
    staff_id: str
    note: str


# ---------- residents ----------

@app.get("/residents/{resident_id}")
def get_resident(resident_id: str):
    resident = mocks.RESIDENTS.get(resident_id)
    if not resident:
        raise HTTPException(404, f"No resident '{resident_id}'")
    return resident


@app.put("/residents/{resident_id}/voice")
def set_voice(resident_id: str, body: VoiceBody):
    return {"ok": True}


# ---------- Speak For Me ----------

@app.post("/suggest")
def suggest(body: SuggestBody):
    options = mocks.SUGGESTIONS.get(body.resident_id, mocks.SUGGESTIONS["marcus"])
    return {"options": options}


@app.post("/speak")
def speak(body: SpeakBody):
    # Real version (James, T1.2): ElevenLabs TTS cached by voice_id + text.
    return {"audio_url": f"https://example.com/audio/mock_{body.resident_id}.mp3"}


@app.post("/sentences")
def log_sentence(body: SentenceBody):
    return {"id": 9001}


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
def get_story(resident_id: str):
    story = mocks.STORY.get(resident_id)
    if not story:
        raise HTTPException(404, f"No story for '{resident_id}'")
    return story


# ---------- Onboarding Coach ----------

@app.post("/coach/ask")
def coach_ask(body: CoachAskBody):
    # Mock behaviour: unknown-style questions get the honest "ask Marcus" shape
    # so William can build both UI states from hour 1.
    if "favourite colour" in body.question.lower():
        return mocks.COACH_ANSWERS["unknown"]
    return mocks.COACH_ANSWERS["default"]


# ---------- Supported Choice ----------

@app.post("/choices")
def create_choice(body: ChoicesBody):
    return mocks.CHOICE_WITH_CONSEQUENCES


@app.post("/choices/{choice_id}/decide")
def decide_choice(choice_id: int, body: DecideBody):
    return {"ok": True}


# ---------- Actions ----------

@app.post("/actions/plan")
def plan_actions(body: ActionPlanBody):
    return mocks.ACTION_PLAN


@app.post("/actions/{plan_id}/approve")
def approve_actions(plan_id: int):
    # Real version: refuses unless plan status is 'approved' by the resident,
    # runs allowlisted tools only, logs to action_results.
    return mocks.ACTION_RESULTS


# ---------- Memory ----------

@app.get("/memories/pending/{resident_id}")
def pending_memories(resident_id: str):
    return {"memories": mocks.PENDING_MEMORIES.get(resident_id, [])}


@app.post("/memories/{memory_id}/confirm")
def confirm_memory(memory_id: int, body: ConfirmBody):
    return {"ok": True}


# ---------- Staff ----------

@app.get("/handoff")
def handoff(staff_id: str, resident_id: str):
    return mocks.HANDOFF


@app.get("/activity/{resident_id}")
def activity(resident_id: str):
    return mocks.ACTIVITY.get(resident_id, {"items": []})


@app.post("/observations")
def add_observation(body: ObservationBody):
    return {"ok": True}


@app.get("/")
def health():
    return {"service": "in-my-words-api", "mode": "mocks", "docs": "/docs"}

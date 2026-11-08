"""ElevenLabs voice service (James, T1). Everything the resident is heard saying.

    await synthesize(voice_id, text) -> (filename, cached)   TTS, cached on disk
    resident_voice(resident_id, profile_voice_id) -> voice_id
    await design_previews(description, text) -> [ {generated_voice_id, audio_bytes} ]
    await save_designed_voice(name, description, generated_voice_id) -> voice_id

Product rule: this module only turns text into audio. It is the caller's job
to call it ONLY after the resident approved the text (the /speak route is
hit from the approval card's ✅). Nothing here decides what gets said.

Cache: one mp3 per (model, voice_id, normalized text) in CACHE_DIR, served by
main.py at /audio/<file>. A repeated sentence never hits ElevenLabs again,
which keeps "approve → audio" instant and saves credits.

Env (repo-root .env):
    ELEVENLABS_ID            required for live audio (ELEVENLABS_API_KEY also works); without it /speak stays in mock mode
    ELEVENLABS_TTS_MODEL          optional, default eleven_flash_v2_5 (low latency)
    ELEVENLABS_FALLBACK_VOICE_ID  optional (alias ELEVENLABS_DEFAULT_VOICE_ID), used before
                                  voices.json / profile has a voice
    AUDIO_CACHE_DIR               optional, default api/audio-cache (gitignored)

Run from api/ like the rest of the backend:
    from services import elevenlabs
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv

_REPO = Path(__file__).resolve().parents[2]
load_dotenv(_REPO / ".env")

API = "https://api.elevenlabs.io/v1"
TTS_MODEL = os.environ.get("ELEVENLABS_TTS_MODEL", "eleven_flash_v2_5")
VOICE_DESIGN_MODEL = "eleven_multilingual_ttv_v2"
OUTPUT_FORMAT = "mp3_44100_128"
CACHE_DIR = Path(os.environ.get("AUDIO_CACHE_DIR", _REPO / "api" / "audio-cache"))
# Written by scripts/design_voices.py. Voice IDs are not secrets, so it is committed.
VOICES_FILE = Path(__file__).with_name("voices.json")
# An ElevenLabs stock voice ("Sarah", as picked on main in 5164b06), so /speak works
# before our designed voices exist. ELEVENLABS_DEFAULT_VOICE_ID is main's name for it.
FALLBACK_VOICE = (os.environ.get("ELEVENLABS_FALLBACK_VOICE_ID")
                  or os.environ.get("ELEVENLABS_DEFAULT_VOICE_ID")
                  or "EXAVITQu4vr4xnSDxMaL")

_http: httpx.AsyncClient | None = None  # one pooled client: skips a TLS handshake per request
_locks: dict[str, asyncio.Lock] = {}  # one in-flight generation per cache key
_voice_overrides: dict[str, str] = {}  # set by PUT /residents/{id}/voice until T2 persists it


class ElevenLabsError(Exception):
    """ElevenLabs could not return audio."""


def api_key() -> str | None:
    # Both names are in use (local .env files say ELEVENLABS_API_KEY; c24639f renamed
    # it to ELEVENLABS_ID). Accept either so a rename never silently mocks /speak.
    return os.environ.get("ELEVENLABS_ID") or os.environ.get("ELEVENLABS_API_KEY") or None


def configured() -> bool:
    return api_key() is not None


_own: tuple[httpx.AsyncClient, asyncio.AbstractEventLoop] | None = None


def _client() -> httpx.AsyncClient:
    # The pool is tied to the event loop it was opened on. uvicorn has one loop,
    # but scripts and tests call asyncio.run() more than once, and reusing the
    # old pool there fails with "Event loop is closed". So a pool we opened is
    # replaced on a new loop. A client set on _http from outside (test mocks)
    # is left alone.
    global _http, _own
    loop = asyncio.get_running_loop()
    stale = _own is not None and _http is _own[0] and _own[1] is not loop
    if _http is None or stale:
        _http = httpx.AsyncClient(base_url=API, timeout=httpx.Timeout(20.0, connect=5.0))
        _own = (_http, loop)
    return _http


def _headers() -> dict:
    key = api_key()
    if not key:
        raise ElevenLabsError("ELEVENLABS_ID (or ELEVENLABS_API_KEY) is not set (add it to the repo-root .env)")
    return {"xi-api-key": key}


def _raise_for(resp: httpx.Response, what: str) -> None:
    if resp.status_code >= 400:
        raise ElevenLabsError(f"{what} failed: HTTP {resp.status_code} {resp.text[:300]}")


# ---------- text to speech ----------

def normalize(text: str) -> str:
    """Collapse whitespace so "Can I  get coffee?" and "Can I get coffee?" share a file."""
    return " ".join(text.split())


def cache_key(voice_id: str, text: str) -> str:
    raw = f"{TTS_MODEL}|{voice_id}|{normalize(text)}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def cache_path(voice_id: str, text: str) -> Path:
    return CACHE_DIR / f"{cache_key(voice_id, text)}.mp3"


async def synthesize(voice_id: str, text: str) -> tuple[str, bool]:
    """Return (filename in CACHE_DIR, was_cached). Generates on a cache miss."""
    text = normalize(text)
    if not text:
        raise ElevenLabsError("nothing to say")
    path = cache_path(voice_id, text)
    if path.exists():
        return path.name, True

    lock = _locks.setdefault(path.name, asyncio.Lock())
    async with lock:
        if path.exists():  # a concurrent request generated it while we waited
            return path.name, True
        resp = await _client().post(
            f"/text-to-speech/{voice_id}",
            params={"output_format": OUTPUT_FORMAT},
            headers={**_headers(), "Accept": "audio/mpeg"},
            json={"text": text, "model_id": TTS_MODEL},
        )
        _raise_for(resp, "text-to-speech")
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".part")
        tmp.write_bytes(resp.content)
        tmp.replace(path)  # atomic: never serve a half-written file
    _locks.pop(path.name, None)
    return path.name, False


# ---------- which voice a resident speaks with ----------

def load_voices() -> dict:
    """voices.json: {resident_id: {"default": voice_id, "options": [...]}}."""
    if not VOICES_FILE.exists():
        return {}
    return json.loads(VOICES_FILE.read_text())


def set_resident_voice(resident_id: str, voice_id: str) -> None:
    _voice_overrides[resident_id] = voice_id


def resident_voice(resident_id: str, profile_voice_id: str | None = None) -> str:
    """The resident's chosen voice → profile → designed default → fallback."""
    return (
        _voice_overrides.get(resident_id)
        or profile_voice_id
        or load_voices().get(resident_id, {}).get("default")
        or FALLBACK_VOICE
    )


def has_override(resident_id: str) -> bool:
    return resident_id in _voice_overrides


# ---------- conversational agents (T1.4 Story Interviewer, T1.6 Coach voice mode) ----------

AGENTS = {"story": "ELEVENLABS_STORY_AGENT_ID", "coach": "ELEVENLABS_COACH_AGENT_ID"}


def agent_id(kind: str) -> str | None:
    """The configured agent for `kind` ("story" or "coach"), or None."""
    env = AGENTS.get(kind)
    return (os.environ.get(env) or None) if env else None


async def signed_url(agent: str) -> str:
    """A short-lived URL the browser uses to start one conversation with `agent`.

    The API key and agent ID stay on the server; the browser only sees this URL.
    """
    resp = await _client().get(
        "/convai/conversation/get-signed-url", params={"agent_id": agent}, headers=_headers())
    _raise_for(resp, "agent session")
    return resp.json()["signed_url"]


# ---------- Voice Design (T1.1, used by scripts/design_voices.py) ----------

async def design_previews(description: str, text: str) -> list[dict]:
    """Generate ~3 candidate voices from a description.

    `text` is what the previews say; ElevenLabs wants 100–1000 characters.
    Returns [{"generated_voice_id": str, "audio": bytes}].
    """
    body = {"voice_description": description, "text": text, "model_id": VOICE_DESIGN_MODEL}
    resp = await _client().post("/text-to-voice/design", headers=_headers(), json=body, timeout=120)
    if resp.status_code == 404:  # older API surface
        body.pop("model_id")
        resp = await _client().post("/text-to-voice/create-previews", headers=_headers(), json=body, timeout=120)
    _raise_for(resp, "voice design")
    return [
        {"generated_voice_id": p["generated_voice_id"], "audio": base64.b64decode(p["audio_base_64"])}
        for p in resp.json()["previews"]
    ]


async def save_designed_voice(name: str, description: str, generated_voice_id: str) -> str:
    """Turn a preview into a permanent voice in the account. Returns its voice_id."""
    body = {"voice_name": name, "voice_description": description, "generated_voice_id": generated_voice_id}
    resp = await _client().post("/text-to-voice", headers=_headers(), json=body, timeout=60)
    if resp.status_code == 404:  # older API surface
        resp = await _client().post(
            "/text-to-voice/create-voice-from-preview", headers=_headers(), json=body, timeout=60)
    _raise_for(resp, "save designed voice")
    return resp.json()["voice_id"]

"""ElevenLabs TTS wrapper (T1.2 real path).

One function, used by POST /speak.

    speak_to_file(text, voice_id) -> Path   cached mp3 on disk, cached by
                                             voice_id + text so a repeat
                                             tap/approval is instant and
                                             costs nothing twice.

Mock-first: if ELEVENLABS_API_KEY is not set, or the request fails, callers
get None and main.py falls back to the mock URL. No exception reaches the
route — speaking must never crash the Speak For Me screen.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

import requests

DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"  # Sarah — used until a resident voice is picked
MODEL_ID = "eleven_flash_v2_5"
AUDIO_DIR = Path(__file__).resolve().parents[1] / "static" / "audio"


class ElevenLabsError(Exception):
    pass


def _load_env() -> None:
    path = Path(__file__).resolve().parents[2] / ".env"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        text = line.strip()
        if not text or text.startswith("#") or "=" not in text:
            continue
        key, value = text.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _cache_path(text: str, voice_id: str) -> Path:
    digest = hashlib.sha256(f"{voice_id}:{text}".encode("utf-8")).hexdigest()[:24]
    return AUDIO_DIR / f"{digest}.mp3"


def speak_to_file(text: str, voice_id: str | None = None) -> Path | None:
    """Return a cached mp3 path for `text`, fetching it from ElevenLabs if needed.

    Returns None (never raises) if the key is missing or the call fails, so
    the caller can fall back to the mock URL.
    """
    text = (text or "").strip()
    if not text:
        return None
    _load_env()
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not key:
        return None
    voice = (voice_id or os.environ.get("ELEVENLABS_DEFAULT_VOICE_ID") or DEFAULT_VOICE_ID).strip()

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    path = _cache_path(text, voice)
    if path.is_file() and path.stat().st_size > 0:
        return path  # cached by voice_id + text — no repeat API cost

    try:
        response = requests.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice}",
            headers={"xi-api-key": key, "Content-Type": "application/json"},
            json={"text": text, "model_id": MODEL_ID},
            timeout=10,
        )
        response.raise_for_status()
        path.write_bytes(response.content)
        return path
    except Exception:
        return None

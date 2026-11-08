"""Speak For Me audio. Story narration does not live here.

Call this only for text the resident already approved, including
"speak tiles only" (the tile words joined, with no model involved).
"""

from __future__ import annotations

from fastapi import HTTPException, Request

from services import elevenlabs
from services.narration import public_audio_url, voice_id_for


async def speak_approved(request: Request, resident_id: str, text: str) -> dict:
    """Return {audio_url, cached} for approved Speak For Me text."""
    spoken = elevenlabs.normalize(text)
    if not spoken:
        raise HTTPException(422, "text is empty")
    if not elevenlabs.configured():
        return {
            "audio_url": f"https://example.com/audio/mock_{resident_id}.mp3",
            "cached": False,
        }

    voice_id = await voice_id_for(resident_id)
    try:
        filename, cached = await elevenlabs.synthesize(voice_id, spoken)
    except elevenlabs.ElevenLabsError as exc:
        print(f"[speak] {exc}")
        raise HTTPException(
            502, "Couldn't make the audio right now. The tiles are still here."
        ) from exc
    return {"audio_url": public_audio_url(request, filename), "cached": cached}

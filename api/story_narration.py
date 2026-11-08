"""My Story narration. Speak For Me does not live here.

Approved chapters are read aloud in the resident's voice. Draft chapters
stay silent. Without an ElevenLabs key the old placeholder URL is kept so
the demo still has a response shape.
"""

from __future__ import annotations

from fastapi import HTTPException, Request

import mocks
from services import elevenlabs, mcp_client
from services.narration import placeholder_audio, public_audio_url, voice_id_for

_MOCK_CHAPTER = "https://example.com/audio/mock_chapter.mp3"
_RESIDENTS = ("marcus", "dana")


async def _chapters(resident_id: str) -> list[dict] | None:
    try:
        result = await mcp_client.get_story(resident_id)
    except Exception as exc:
        print(f"[story fallback] {type(exc).__name__}: {exc}")
        result = None
    if isinstance(result, dict) and isinstance(result.get("chapters"), list):
        return result["chapters"]
    story = mocks.STORY.get(resident_id)
    if not story:
        return None
    return story["chapters"]


async def _find(chapter_id: int) -> tuple[str, dict] | None:
    for resident_id in _RESIDENTS:
        chapters = await _chapters(resident_id)
        for chapter in chapters or []:
            if chapter.get("id") == chapter_id:
                return resident_id, chapter
    return None


async def _narrate(request: Request, resident_id: str, text: str) -> dict:
    voice_id = await voice_id_for(resident_id)
    try:
        filename, cached = await elevenlabs.synthesize(voice_id, text)
    except elevenlabs.ElevenLabsError as exc:
        print(f"[story] {exc}")
        raise HTTPException(
            502, "Couldn't read this chapter aloud right now."
        ) from exc
    return {"audio_url": public_audio_url(request, filename), "cached": cached}


async def story_for(request: Request, resident_id: str) -> dict:
    """Chapters for one resident. Approved text is narrated when voice is live."""
    chapters = await _chapters(resident_id)
    if chapters is None:
        raise HTTPException(404, f"No story for '{resident_id}'")
    ready = []
    for chapter in chapters:
        copy = dict(chapter)
        text = elevenlabs.normalize(str(copy.get("text") or ""))
        if (
            copy.get("status") == "approved"
            and text
            and elevenlabs.configured()
            and placeholder_audio(copy.get("audio_url"))
        ):
            spoken = await _narrate(request, resident_id, text)
            copy["audio_url"] = spoken["audio_url"]
        ready.append(copy)
    return {"chapters": ready}


async def approve_story(request: Request, chapter_id: int) -> dict:
    """Read an approved chapter in the resident's voice."""
    found = await _find(chapter_id)
    if found is None or not elevenlabs.configured():
        return {"audio_url": _MOCK_CHAPTER, "cached": False}
    resident_id, chapter = found
    text = elevenlabs.normalize(str(chapter.get("text") or ""))
    if not text:
        return {"audio_url": _MOCK_CHAPTER, "cached": False}
    return await _narrate(request, resident_id, text)

"""Shared voice lookup and public audio URLs for Speak For Me and My Story.

The two features stay in their own modules. Both call this only after the
resident has approved the text that will be spoken.
"""

from __future__ import annotations

import os

from fastapi import Request

from services import elevenlabs, mcp_client


def public_audio_url(request: Request, filename: str) -> str:
    """Browser-facing URL for a cached mp3.

    Behind the deployed proxy the API is called on 127.0.0.1, so the public
    base comes from PUBLIC_API_URL (set by ops/deploy.sh).
    """
    public = os.environ.get("PUBLIC_API_URL", "").rstrip("/")
    if public:
        return f"{public}/audio/{filename}"
    return str(request.url_for("audio", path=filename))


def placeholder_audio(url: str | None) -> bool:
    """True when a chapter has no file the resident can actually hear."""
    if not url:
        return True
    return "example.com" in url


async def voice_id_for(resident_id: str) -> str:
    """Chosen voice, then the profile voice, then the designed default."""
    profile_voice = None
    if not elevenlabs.has_override(resident_id):
        try:
            profile = await mcp_client.get_profile(resident_id)
        except Exception:
            profile = None
        if isinstance(profile, dict) and not profile.get("error"):
            profile_voice = profile.get("voice_id")
    return elevenlabs.resident_voice(resident_id, profile_voice)

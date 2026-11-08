"""T4.2 photo pipeline wiring: Cloudinary fetch -> photo checker (Gemini) ->
tile builder (code) -> MCP save_tile. The /media/photos route calls
add_photo_tile. A failed check never blocks staff; a failed save is reported.
"""

import asyncio
import os

import httpx

from agents.photos.checker import check_photo
from agents.photos.tiler import decide
from services import mcp_client
from services.cloudinary import normalize_public_id

# Small JPEG for the model: enough to recognise a subject, cheap to send.
_CHECK_TRANSFORM = "c_limit,w_768,h_768/f_jpg/q_auto"


def _cloud() -> str:
    return (os.environ.get("CLOUDINARY_CLOUD_NAME")
            or os.environ.get("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME") or "").strip()


async def fetch_photo(public_id: str) -> tuple[bytes, str]:
    cloud = _cloud()
    if not cloud:
        raise RuntimeError("CLOUDINARY_CLOUD_NAME is not set")
    url = f"https://res.cloudinary.com/{cloud}/image/upload/{_CHECK_TRANSFORM}/{public_id}"
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(url)
    response.raise_for_status()
    return response.content, "image/jpeg"


def gemini_generate(prompt: str, schema: dict, images) -> dict:
    from services import gemini  # late import: needs the key only when used
    return gemini.generate_for("photo", prompt, schema, images=images)


async def run_check(public_id: str, label: str, *, fetch=fetch_photo, generate=gemini_generate):
    """The checker's report, or None when it couldn't run (no key, Cloudinary
    or Gemini down). None means 'save with the staff label, marked not checked'."""
    if not os.environ.get("GEMINI_API_KEY") and generate is gemini_generate:
        return None
    try:
        image, mime = await fetch(public_id)
        return await asyncio.to_thread(check_photo, image, mime, label, generate=generate)
    except Exception as exc:
        print(f"[photos] check skipped ({type(exc).__name__}): {exc}")
        return None


async def add_photo_tile(resident_id: str, public_id: str, label: str, *, confirmed: bool = False,
                         check=None, profile=None, save=None) -> dict:
    """Returns one of:
      {"status": "saved", "tile": {...}, "replaced": bool, "checked": bool, "shows": str|None}
      {"status": "needs_review", "reasons": [...], "label", "category", "shows"}
      {"status": "error", "reason": str}
    """
    check = check or run_check
    profile = profile or mcp_client.get_profile
    save = save or mcp_client.save_tile
    public_id = normalize_public_id(public_id)  # raises PublicIdError on a URL/path

    resident = await profile(resident_id)
    if not isinstance(resident, dict) or resident.get("error") or "tiles" not in resident:
        return {"status": "error", "reason": f"Unknown resident '{resident_id}'."}

    # A confirmed retry skips the model: staff already saw the report.
    report = None if confirmed else await check(public_id, label)
    decision = decide(label, report, resident["tiles"], confirmed=confirmed)
    if decision["action"] == "error":
        return {"status": "error", "reason": decision["reason"]}
    if decision["action"] == "review":
        return {"status": "needs_review", "public_id": public_id, **{
            k: decision[k] for k in ("reasons", "label", "category", "shows", "replaces")}}

    saved = await save(resident_id, decision["label"], public_id, decision["category"])
    if not isinstance(saved, dict) or saved.get("error"):
        return {"status": "error", "reason": (saved or {}).get("error", "The tile was not saved.")}
    return {"status": "saved", "tile": saved["tile"], "replaced": saved["replaced"],
            "checked": decision["checked"] or confirmed, "shows": decision["shows"]}

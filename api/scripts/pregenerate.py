"""Warm the audio cache so demo lines play with zero wait (T1.3 / T1.8).

Run from api/ (needs ELEVENLABS_ID; run scripts.design_voices first so
residents speak in their own designed voice):

    python -m scripts.pregenerate

Generates:
  - each designed voice's preview line from services/voices.json (the voice picker)
  - in each resident's default voice: every tile label from db/seed/<resident>.json
    (long-press speaks the label) and the mock sentence suggestions (demo lines)
Already-cached lines are skipped, so it is cheap to re-run.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import mocks
from services import elevenlabs

SEED = Path(__file__).resolve().parents[2] / "db" / "seed"


def lines_for(resident_id: str) -> list[str]:
    lines: list[str] = []
    seed = SEED / f"{resident_id}.json"
    if seed.exists():
        lines += [t["label"] for t in json.loads(seed.read_text()).get("tiles", [])]
    lines += mocks.SUGGESTIONS.get(resident_id, [])
    return list(dict.fromkeys(lines))  # dedupe, keep order


async def main() -> None:
    if not elevenlabs.configured():
        sys.exit("ELEVENLABS_ID is not set. Add it to the repo-root .env first.")
    for resident_id, entry in elevenlabs.load_voices().items():
        for option in entry.get("options", []):
            await elevenlabs.synthesize(option["voice_id"], option["preview_text"])
        print(f"{resident_id}: {len(entry.get('options', []))} voice previews ready")
    for resident_id in ("marcus", "dana"):
        voice_id = elevenlabs.resident_voice(resident_id)
        made = 0
        for line in lines_for(resident_id):
            _, cached = await elevenlabs.synthesize(voice_id, line)
            made += not cached
        print(f"{resident_id}: {len(lines_for(resident_id))} lines ready ({made} newly generated) in voice {voice_id}")


if __name__ == "__main__":
    asyncio.run(main())

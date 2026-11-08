"""T1.1: design 3 voices each for Marcus and Dana, save them, write voices.json.

Run from api/ (needs ELEVENLABS_API_KEY in the repo-root .env):

    python -m scripts.design_voices            # both residents
    python -m scripts.design_voices marcus     # just one

For each resident it asks Voice Design for candidate voices, keeps the first
three, saves each as a permanent voice in the ElevenLabs account, and records
them in services/voices.json (option 1 is the default until the resident picks
one in the voice picker). It then pre-generates each voice's short preview line
into the audio cache so the picker plays instantly.

Re-running replaces that resident's entry in voices.json. The old voices stay
in the ElevenLabs account; delete them there if you want to tidy up.
Send the printed voice IDs to Tiffany (T2) for the seed data.
"""

from __future__ import annotations

import asyncio
import json
import sys

from services import elevenlabs

RESIDENTS = {
    "marcus": {
        "name": "Marcus",
        "description": (
            "A warm, calm Canadian man in his mid-thirties. Gentle, unhurried pace, "
            "friendly and relaxed, clear diction, soft-spoken but confident."
        ),
        "design_text": (
            "Hi, I'm Marcus. I like bowling on Saturdays and watching the Raptors with "
            "a double-double from Tim's. Loud rooms are hard for me, so quiet helps. "
            "Thanks for listening to me."
        ),
        "preview": "Hi, I'm Marcus. I like bowling on Saturdays.",
    },
    "dana": {
        "name": "Dana",
        "description": (
            "A friendly, gentle Canadian woman in her early fifties. Warm and kind, "
            "steady relaxed pace, clear and cheerful without being loud."
        ),
        "design_text": (
            "Hi, I'm Dana. I love gardening, and I'd like to grow herbs on my balcony. "
            "My sister visits on Sundays and we have tea together. I like to plan my "
            "own week and my own budget."
        ),
        "preview": "Hi, I'm Dana. I love my garden.",
    },
}


async def design(resident_id: str) -> dict:
    spec = RESIDENTS[resident_id]
    print(f"\n[{resident_id}] designing voices…")
    previews = (await elevenlabs.design_previews(spec["description"], spec["design_text"]))[:3]
    if len(previews) < 3:
        print(f"  note: only got {len(previews)} previews")

    options = []
    for i, p in enumerate(previews, start=1):
        name = f"In My Words – {spec['name']} {i}"
        voice_id = await elevenlabs.save_designed_voice(name, spec["description"], p["generated_voice_id"])
        filename, _ = await elevenlabs.synthesize(voice_id, spec["preview"])
        options.append({"voice_id": voice_id, "label": f"Voice {i}", "preview_text": spec["preview"],
                        "preview_file": filename})
        print(f"  {name}: {voice_id}")
    return {"default": options[0]["voice_id"], "options": options}


async def main(targets: list[str]) -> None:
    if not elevenlabs.configured():
        sys.exit("ELEVENLABS_API_KEY is not set. Add it to the repo-root .env first.")
    unknown = [t for t in targets if t not in RESIDENTS]
    if unknown:
        sys.exit(f"Unknown resident(s): {', '.join(unknown)}. Known: {', '.join(RESIDENTS)}")

    voices = elevenlabs.load_voices()
    for resident_id in targets:
        voices[resident_id] = await design(resident_id)
        # save after each resident so a later failure keeps earlier work
        elevenlabs.VOICES_FILE.write_text(json.dumps(voices, indent=2) + "\n")

    print(f"\nWrote {elevenlabs.VOICES_FILE}")
    print("Send these voice IDs to Tiffany for db/seed (default = option 1):")
    for rid in targets:
        print(f"  {rid}: {[o['voice_id'] for o in voices[rid]['options']]}")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:] or list(RESIDENTS)))

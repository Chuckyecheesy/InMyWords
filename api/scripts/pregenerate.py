"""Warm the audio cache so every demo line plays with zero wait (T1.3 / T1.5 / T1.8).

Run from api/ (needs ELEVENLABS_ID; run scripts.design_voices first so
residents speak in their own designed voice). ops/deploy.sh runs this on the VM
after every deploy:

    python -m scripts.pregenerate

In each resident's default voice it generates everything a resident can hear:
  - tile labels (long-press) and the demo sentence suggestions
  - resident-screen button and nav labels (long-press speaks any label)
  - story chapter titles, questions and picture options (web/lib/story-chapters.ts)
  - narration of each seeded story chapter, so "Yes, read it" plays at once
  - extra demo lines (speak-tiles-only, the tea confirmation)
plus each designed voice's preview line (the voice picker).

The cache key is voice + exact text, so these must match what the screens send.
Already-cached lines are skipped, so re-running is cheap.
"""

from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
import sys
from pathlib import Path

import mocks
from services import elevenlabs

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "db" / "seed"
STORY_CHAPTERS_TS = ROOT / "web" / "lib" / "story-chapters.ts"

# Static labels on resident screens. BigButton long-press speaks its visible text.
UI_LABELS = [
    # ResidentNav
    "Tiles", "Story", "Choice", "Confirm", "Voice",
    # shared answers and controls
    "Yes", "No", "Undo", "Back", "Next", "Approve", "Reject", "Cancel",
    # story interview and review
    "Save this answer", "Make my chapter", "All chapters", "Yes, read it", "Not yet",
    "Story guide: on", "Story guide: off", "Stop the story guide",
]

# Demo-script lines beyond the tiles and suggestions (PROJECT_PLAN §8).
DEMO_LINES = {
    "marcus": ["coffee now", "Can I get a double-double from Tim's?", "Likes tea now", "In Marcus's words."],
    "dana": ["garden now", "Prefers tea over coffee", "In Dana's words."],
}


def story_phrases() -> list[str]:
    """Chapter titles, questions and option labels, read by running story-chapters.ts."""
    node = shutil.which("node")
    if not node or not STORY_CHAPTERS_TS.exists():
        print("  note: node or story-chapters.ts missing; skipping story phrases")
        return []
    script = (
        f"import({json.dumps(STORY_CHAPTERS_TS.as_uri())}).then(m => console.log(JSON.stringify("
        "m.STORY_CHAPTERS.flatMap(c => [c.title, ...c.questions.flatMap(q => [q.question, ...q.options.map(o => o.label)])])"
        ")))"
    )
    try:
        out = subprocess.run([node, "--experimental-strip-types", "--no-warnings", "-e", script],
                             capture_output=True, text=True, timeout=30, check=True).stdout
        return json.loads(out)
    except (subprocess.SubprocessError, json.JSONDecodeError) as exc:
        print(f"  note: could not read story chapters ({exc}); skipping story phrases")
        return []


def seed(resident_id: str) -> dict:
    path = SEED / f"{resident_id}.json"
    return json.loads(path.read_text()) if path.exists() else {}


def lines_for(resident_id: str, story: list[str]) -> list[str]:
    data = seed(resident_id)
    lines = [t["label"] for t in data.get("tiles", [])]
    lines += mocks.SUGGESTIONS.get(resident_id, [])
    lines += UI_LABELS + story + DEMO_LINES.get(resident_id, [])
    lines += [c["text"] for c in data.get("story_chapters", []) if c.get("text")]  # narration
    return list(dict.fromkeys(line for line in (elevenlabs.normalize(x) for x in lines) if line))


async def main() -> None:
    if not elevenlabs.configured():
        sys.exit("ELEVENLABS_ID is not set. Add it to the repo-root .env first.")
    for resident_id, entry in elevenlabs.load_voices().items():
        for option in entry.get("options", []):
            await elevenlabs.synthesize(option["voice_id"], option["preview_text"])
        print(f"{resident_id}: {len(entry.get('options', []))} voice previews ready")

    story = story_phrases()
    for resident_id in ("marcus", "dana"):
        voice_id = elevenlabs.resident_voice(resident_id, seed(resident_id).get("resident", {}).get("voice_id"))
        lines = lines_for(resident_id, story)
        made = 0
        for line in lines:
            _, cached = await elevenlabs.synthesize(voice_id, line)
            made += not cached
        print(f"{resident_id}: {len(lines)} lines ready ({made} newly generated) in voice {voice_id}")


if __name__ == "__main__":
    asyncio.run(main())

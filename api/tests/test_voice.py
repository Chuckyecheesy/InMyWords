"""T3.2 recorded tile checks. No Gemini key required.

Fifteen taps across Marcus and Dana. Each result is 2 or 3 first-person
lines, each under 12 words, and none of them add a want the tiles did not say.
"""

from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents.voice import is_faithful, load_seed_memories, suggest, word_count  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SEED = json.loads((ROOT / "db" / "seed" / "memories.json").read_text(encoding="utf-8"))


def memories_for(resident: str) -> list[dict]:
    return [row for row in SEED["memories"] if row["resident_id"] == resident]


# The record of the 15 combinations. `must` is a substring one option has to
# include. `must_not` is a new want that must not appear.
CASES = [
    ("marcus", ["coffee"], "morning", "double-double", "tea"),
    ("marcus", ["coffee", "quiet"], "morning", "quiet", "tea"),
    ("marcus", ["bowling"], "afternoon", "Saturday", "coffee"),
    ("marcus", ["bowling", "Lisa"], "afternoon", "Lisa", "coffee"),
    ("marcus", ["Raptors"], "evening", "Raptors", "bowling"),
    ("marcus", ["park", "quiet"], "afternoon", "quiet", "bowling"),
    ("marcus", ["tea"], "morning", "tea", "double-double"),
    ("marcus", ["bus", "bowling"], "afternoon", "bus", "coffee"),
    ("marcus", ["help"], "evening", "help", "coffee"),
    ("marcus", ["music", "quiet"], "evening", "music", "bowling"),
    ("dana", ["garden"], "morning", "garden", "grocery"),
    ("dana", ["garden", "tea"], "afternoon", "tea", "bowling"),
    ("dana", ["sister", "tea"], "afternoon", "sister", "garden"),
    ("dana", ["groceries"], "morning", "groceries", "garden"),
    ("dana", ["walk"], "evening", "walk", "tea"),
]


class TileSuggestionTests(unittest.TestCase):
    def test_fifteen_taps_are_personal_and_faithful(self):
        self.assertEqual(len(CASES), 15)
        for resident, tiles, time, must, banned in CASES:
            memories = memories_for(resident)
            result = suggest(
                resident_id=resident,
                name=resident.capitalize(),
                tiles=tiles,
                time_of_day=time,
                memories=memories,
                generate=None,
            )
            options = result["options"]
            self.assertGreaterEqual(len(options), 2, tiles)
            self.assertLessEqual(len(options), 3, tiles)
            for line in options:
                self.assertLessEqual(word_count(line), 12, line)
                self.assertTrue(
                    is_faithful(line, tiles, memories, time),
                    f"{tiles}: {line}",
                )
                self.assertNotIn(banned.lower(), line.lower(), line)
            blob = " ".join(options).lower()
            self.assertIn(must.lower(), blob, options)

    def test_coffee_uses_the_tims_memory(self):
        result = suggest(
            resident_id="marcus",
            name="Marcus",
            tiles=["coffee"],
            time_of_day="morning",
            memories=memories_for("marcus"),
            generate=None,
        )
        self.assertTrue(any("Tim" in line for line in result["options"]))

    def test_model_line_is_kept_when_faithful(self):
        def generate(prompt, schema, **kwargs):
            self.assertIn("coffee", prompt)
            self.assertEqual(schema["required"], ["options"])
            return {
                "options": [
                    "Can I get a double-double from Tim's?",
                    "I want tea and a donut.",
                ]
            }

        result = suggest(
            resident_id="marcus",
            name="Marcus",
            tiles=["coffee"],
            time_of_day="morning",
            memories=memories_for("marcus"),
            generate=generate,
        )
        self.assertIn("Can I get a double-double from Tim's?", result["options"])
        self.assertTrue(all("donut" not in line.lower() for line in result["options"]))
        self.assertGreaterEqual(len(result["options"]), 2)

    def test_missing_gemini_key_still_returns_sentences(self):
        os.environ["GEMINI_API_KEY"] = ""
        result = suggest(
            resident_id="marcus",
            name="Marcus",
            tiles=["coffee"],
            time_of_day="morning",
            memories=memories_for("marcus"),
            generate="auto",
        )
        self.assertGreaterEqual(len(result["options"]), 2)
        self.assertTrue(any("double-double" in line for line in result["options"]))

    def test_seed_fallback_matches_the_file(self):
        loaded = load_seed_memories("dana")
        self.assertTrue(any("garden" in row["content"].lower() for row in loaded))


if __name__ == "__main__":
    unittest.main()

"""Story execution layer, including live ElevenLabs when the repo-root .env has a key.

Draft never calls the voice service. narrate does, once, in the resident's voice.
A repeat of the same line is cached. Marcus and Dana do not share a voice file.
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents.story import LocalBooks, StoryError, draft, draft_text, grounded, narrate, record_answer
from services import elevenlabs


def _mp3(path: Path) -> bool:
    data = path.read_bytes()[:3]
    if data == b"ID3":
        return True
    raw = path.read_bytes()[:2]
    return len(raw) == 2 and raw[0] == 0xFF and (raw[1] & 0xE0) == 0xE0


class ExecutionTests(unittest.TestCase):
    def test_repeat_answer_replaces_and_draft_adds_no_facts(self):
        books = LocalBooks()

        async def run():
            await record_answer(books, "marcus", "exec_day", "Morning drink?", "Coffee")
            await record_answer(books, "marcus", "exec_day", "Morning drink?", "Tea")
            await record_answer(books, "marcus", "exec_day", "When it is loud?", "Quiet")
            before = set(elevenlabs.CACHE_DIR.glob("*.mp3")) if elevenlabs.CACHE_DIR.exists() else set()
            result = await draft(books, "marcus", "exec_day", generate=lambda *_: "I love the Raptors and a double-double.")
            after = set(elevenlabs.CACHE_DIR.glob("*.mp3")) if elevenlabs.CACHE_DIR.exists() else set()
            return result, before, after

        result, before, after = asyncio.run(run())
        self.assertIsNone(result["audio_url"])
        self.assertEqual(result["status"], "draft")
        self.assertIn("Tea", result["text"])
        self.assertNotIn("Coffee", result["text"])
        self.assertIn("Quiet", result["text"])
        self.assertNotIn("Raptors", result["text"])
        self.assertNotIn("double-double", result["text"])
        self.assertEqual(before, after)
        self.assertTrue(grounded(result["text"], "Marcus", [
            {"question": "Morning drink?", "answer": "Tea"},
            {"question": "When it is loud?", "answer": "Quiet"},
        ]))

    def test_draft_without_answers_does_not_invent_a_chapter(self):
        books = LocalBooks()
        with self.assertRaises(StoryError):
            asyncio.run(draft(books, "marcus", "exec_empty"))
        self.assertEqual(books.chapters, [])

    def test_code_draft_is_only_the_answers(self):
        text = draft_text("Dana", [{"question": "Where do you like to go?", "answer": "The garden"}])
        self.assertIn("Dana", text)
        self.assertIn("The garden", text)
        self.assertNotIn("bowling", text.lower())


@unittest.skipUnless(elevenlabs.configured(), "ELEVENLABS_API_KEY is not set")
class LiveVoiceTests(unittest.TestCase):
    def test_marcus_and_dana_get_different_voices(self):
        marcus = elevenlabs.resident_voice("marcus")
        dana = elevenlabs.resident_voice("dana")
        self.assertNotEqual(marcus, dana)
        self.assertNotEqual(marcus, elevenlabs.FALLBACK_VOICE)

        async def both():
            marcus_file, marcus_cached = await elevenlabs.synthesize(marcus, "Lisa.")
            dana_file, _ = await elevenlabs.synthesize(dana, "Lisa.")
            again, cached = await elevenlabs.synthesize(marcus, "Lisa.")
            return marcus_file, marcus_cached, dana_file, again, cached

        marcus_file, _, dana_file, again, cached = asyncio.run(both())
        self.assertNotEqual(marcus_file, dana_file)
        self.assertEqual(again, marcus_file)
        self.assertTrue(cached)
        self.assertTrue(_mp3(elevenlabs.CACHE_DIR / marcus_file))
        self.assertTrue(_mp3(elevenlabs.CACHE_DIR / dana_file))

    def test_narrate_speaks_the_draft_and_a_second_approve_does_not(self):
        books = LocalBooks()

        async def run():
            await record_answer(books, "marcus", "exec_read", "Morning drink?", "Tea")
            drafted = await draft(books, "marcus", "exec_read")
            self.assertIsNone(drafted["audio_url"])
            spoken = await narrate(books, drafted["chapter_id"])
            self.assertTrue(spoken["filename"])
            audio_url = f"http://127.0.0.1:8000/audio/{spoken['filename']}"
            await books.mark_approved(drafted["chapter_id"], audio_url)
            self.assertTrue(_mp3(elevenlabs.CACHE_DIR / spoken["filename"]))
            again = await narrate(books, drafted["chapter_id"])
            return spoken, again

        spoken, again = asyncio.run(run())
        self.assertTrue(again["cached"])
        self.assertIsNone(again["filename"])
        self.assertTrue(again["audio_url"].endswith(spoken["filename"]))

        with self.assertRaises(StoryError):
            asyncio.run(narrate(books, 99999))


if __name__ == "__main__":
    unittest.main()

"""Speak For Me and My Story stay on separate paths and both return audio.

No ElevenLabs key and no database: synthesis is faked. Run from api/:

    python -m unittest tests.test_speak_story_e2e
"""

from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from main import app
from services import elevenlabs


class SpeakStorySplitTest(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.spoken: list[str] = []

        async def fake_synthesize(voice_id: str, text: str):
            self.spoken.append(text)
            kind = "story" if text.startswith("I'm") else "speak"
            return f"{kind}-{len(self.spoken)}.mp3", False

        self.synth = patch.object(elevenlabs, "synthesize", fake_synthesize)
        down = AsyncMock(side_effect=ConnectionError("mcp down"))
        self.profile = patch("services.mcp_client.get_profile", new=down)
        self.story = patch("services.mcp_client.get_story", new=AsyncMock(side_effect=ConnectionError("mcp down")))
        self.recall = patch("services.mcp_client.recall", new=AsyncMock(side_effect=ConnectionError("mcp down")))
        self.synth.start()
        self.profile.start()
        self.story.start()
        self.recall.start()
        self.addCleanup(self.synth.stop)
        self.addCleanup(self.profile.stop)
        self.addCleanup(self.story.stop)
        self.addCleanup(self.recall.stop)

    def test_without_a_key_each_feature_keeps_its_own_placeholder(self):
        with patch.object(elevenlabs, "configured", return_value=False):
            speak = self.client.post(
                "/speak",
                json={"resident_id": "marcus", "text": "Can I get a double-double?"},
            )
            story = self.client.post("/story/approve", json={"chapter_id": 99999})
            chapters = self.client.get("/story/marcus")
        self.assertEqual(speak.status_code, 200)
        self.assertIn("mock_marcus", speak.json()["audio_url"])
        self.assertEqual(story.status_code, 422)
        self.assertIn("example.com", chapters.json()["chapters"][0]["audio_url"])
        self.assertIsNone(chapters.json()["chapters"][1]["audio_url"])
        self.assertEqual(self.spoken, [])

    def test_live_voice_speaks_the_approved_line_and_not_the_chapter(self):
        with patch.object(elevenlabs, "configured", return_value=True):
            speak = self.client.post(
                "/speak",
                json={"resident_id": "marcus", "text": "Can I get a double-double?"},
            )
            approved = self.client.post("/story/approve", json={"chapter_id": 99999})
        self.assertEqual(speak.status_code, 200, speak.text)
        self.assertTrue(speak.json()["audio_url"].endswith("/audio/speak-1.mp3"))
        self.assertEqual(approved.status_code, 422)
        self.assertEqual(self.spoken, ["Can I get a double-double?"])

    def test_tiles_stay_the_inventory_and_coffee_does_not_become_tea(self):
        resident = self.client.get("/residents/marcus")
        self.assertEqual(resident.status_code, 200, resident.text)
        labels = [tile["label"] for tile in resident.json()["tiles"]]
        self.assertIn("coffee", labels)
        suggestion = self.client.post(
            "/suggest",
            json={"resident_id": "marcus", "tiles": ["coffee"], "time": "now"},
        )
        self.assertEqual(suggestion.status_code, 200, suggestion.text)
        options = " ".join(suggestion.json()["options"]).lower()
        self.assertIn("coffee", options)
        self.assertNotIn("tea", options)


if __name__ == "__main__":
    unittest.main()

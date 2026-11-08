"""T1.2: speak service caches by voice + text and picks the right voice. No API key needed.

Run from api/:

    python -m unittest tests.test_elevenlabs
"""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path

import httpx

from services import elevenlabs


class _FakeElevenLabs:
    """Records calls; returns fake mp3 bytes, or an error status."""

    def __init__(self, status: int = 200):
        self.calls: list[httpx.Request] = []
        self.status = status

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        if self.status != 200:
            return httpx.Response(self.status, text="quota exceeded")
        return httpx.Response(200, content=b"ID3fake-mp3:" + request.content)


class SpeakServiceTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._saved = (elevenlabs.CACHE_DIR, elevenlabs.VOICES_FILE, elevenlabs._http,
                       os.environ.get("ELEVENLABS_ID"))
        elevenlabs.CACHE_DIR = Path(self.tmp.name) / "cache"
        elevenlabs.VOICES_FILE = Path(self.tmp.name) / "voices.json"
        elevenlabs._voice_overrides.clear()
        os.environ["ELEVENLABS_ID"] = "test-key"
        self.fake = _FakeElevenLabs()
        elevenlabs._http = httpx.AsyncClient(base_url=elevenlabs.API, transport=httpx.MockTransport(self.fake))

    async def asyncTearDown(self):
        await elevenlabs._http.aclose()
        elevenlabs.CACHE_DIR, elevenlabs.VOICES_FILE, elevenlabs._http, key = self._saved
        if key is None:
            os.environ.pop("ELEVENLABS_ID", None)
        else:
            os.environ["ELEVENLABS_ID"] = key
        elevenlabs._voice_overrides.clear()
        self.tmp.cleanup()

    async def test_second_request_is_served_from_cache(self):
        name1, cached1 = await elevenlabs.synthesize("v1", "Can I get a double-double?")
        name2, cached2 = await elevenlabs.synthesize("v1", "Can I get a double-double?")
        self.assertEqual((cached1, cached2), (False, True))
        self.assertEqual(name1, name2)
        self.assertEqual(len(self.fake.calls), 1)
        self.assertTrue((elevenlabs.CACHE_DIR / name1).read_bytes().startswith(b"ID3"))

    async def test_request_shape(self):
        await elevenlabs.synthesize("voice_abc", "coffee now")
        req = self.fake.calls[0]
        self.assertEqual(req.url.path, "/v1/text-to-speech/voice_abc")
        self.assertEqual(req.headers["xi-api-key"], "test-key")
        self.assertEqual(json.loads(req.content), {"text": "coffee now", "model_id": elevenlabs.TTS_MODEL})

    async def test_whitespace_shares_cache_but_voice_does_not(self):
        a, _ = await elevenlabs.synthesize("v1", "coffee   now ")
        b, cached = await elevenlabs.synthesize("v1", "coffee now")
        c, _ = await elevenlabs.synthesize("v2", "coffee now")
        self.assertEqual(a, b)
        self.assertTrue(cached)
        self.assertNotEqual(a, c)

    async def test_concurrent_identical_requests_generate_once(self):
        results = await asyncio.gather(*[elevenlabs.synthesize("v1", "help") for _ in range(5)])
        self.assertEqual(len({name for name, _ in results}), 1)
        self.assertEqual(len(self.fake.calls), 1)

    async def test_api_error_raises_and_caches_nothing(self):
        self.fake.status = 401
        with self.assertRaises(elevenlabs.ElevenLabsError):
            await elevenlabs.synthesize("v1", "hello")
        self.assertFalse(list(elevenlabs.CACHE_DIR.glob("*.mp3")) if elevenlabs.CACHE_DIR.exists() else [])

    async def test_empty_text_refused(self):
        with self.assertRaises(elevenlabs.ElevenLabsError):
            await elevenlabs.synthesize("v1", "   ")
        self.assertEqual(self.fake.calls, [])

    def test_voice_resolution_order(self):
        self.assertEqual(elevenlabs.resident_voice("marcus"), elevenlabs.FALLBACK_VOICE)
        elevenlabs.VOICES_FILE.write_text(json.dumps({"marcus": {"default": "designed", "options": []}}))
        self.assertEqual(elevenlabs.resident_voice("marcus"), "designed")
        self.assertEqual(elevenlabs.resident_voice("marcus", "from_profile"), "from_profile")
        elevenlabs.set_resident_voice("marcus", "picked")
        self.assertEqual(elevenlabs.resident_voice("marcus", "from_profile"), "picked")

    def test_not_configured_without_key(self):
        os.environ.pop("ELEVENLABS_ID")
        self.assertFalse(elevenlabs.configured())


if __name__ == "__main__":
    unittest.main()

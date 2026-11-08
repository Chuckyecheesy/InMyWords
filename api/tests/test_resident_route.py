"""A broken profile response must not 500 the resident page."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

import main as api_main  # noqa: E402


class ResidentProfileTests(unittest.TestCase):
    def test_incomplete_profile_is_not_usable(self):
        body, missing = api_main.resident_from_profile("marcus", {"unexpected": True})
        self.assertIsNone(body)
        self.assertIsNone(missing)

    def test_unknown_resident_stays_missing(self):
        body, missing = api_main.resident_from_profile("marcus", {"error": "no resident 'marcus'"})
        self.assertEqual(body, "missing")
        self.assertIn("marcus", missing)

    def test_usable_profile_keeps_optional_fields_empty(self):
        body, missing = api_main.resident_from_profile(
            "marcus",
            {"name": "Marcus", "tiles": [{"label": "coffee"}], "voice_id": None},
        )
        self.assertIsNone(missing)
        self.assertEqual(body["name"], "Marcus")
        self.assertEqual(body["preferences"], [])
        self.assertEqual(body["routines"], [])
        self.assertEqual(body["pending_patterns"], [])

    def test_route_serves_the_demo_resident_when_the_profile_is_unusable(self):
        async def broken(_resident_id):
            return {"unexpected": True}

        with patch.object(api_main.mcp_client, "get_profile", broken):
            response = TestClient(api_main.app).get("/residents/marcus")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["name"], "Marcus")
        self.assertTrue(response.json()["tiles"])

    def test_route_404s_when_the_profile_says_missing(self):
        async def missing(_resident_id):
            return {"error": "no resident 'nobody'"}

        with patch.object(api_main.mcp_client, "get_profile", missing):
            response = TestClient(api_main.app).get("/residents/nobody")
        self.assertEqual(response.status_code, 404)

"""Input outcomes must be persisted before the API acknowledges them."""
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "mcp"))
from fastapi.testclient import TestClient
import main
from store import SeedStore

EVENT = {
    "ts": "2026-11-08T12:00:00Z", "resident_id": "marcus",
    "session_id": "gaze-test", "input_type": "gaze", "action": "select",
    "target": "coffee", "hold_ms": 1000, "gesture": None,
    "confidence": 0.8, "outcome": "confirmed",
}

class InputEventTests(unittest.TestCase):
    def test_storage_unavailable_is_retryable(self):
        with patch.object(main.mcp_client, "log_input_events", AsyncMock(side_effect=RuntimeError("offline"))):
            response = TestClient(main.app).post("/input-events", json={"events": [EVENT]})
        self.assertEqual(response.status_code, 503)

    def test_partial_or_invalid_acknowledgements_are_retryable(self):
        for result in ({"saved": 0}, {"error": "offline"}, None):
            with self.subTest(result=result):
                with patch.object(main.mcp_client, "log_input_events", AsyncMock(return_value=result)):
                    response = TestClient(main.app).post("/input-events", json={"events": [EVENT]})
                self.assertEqual(response.status_code, 503)

    def test_saved_gaze_events_update_the_profile(self):
        store = SeedStore()
        store._input_events = []
        async def save(events):
            return {"saved": store.log_input_events(events)}
        async def profile(resident):
            return store.get_input_profile(resident)
        with patch.object(main.mcp_client, "log_input_events", save), patch.object(main.mcp_client, "get_input_profile", profile):
            client = TestClient(main.app)
            response = client.post("/input-events", json={"events": [EVENT] * 12})
            self.assertEqual(response.json(), {"saved": 12})
            learned = client.get("/input-profile/marcus").json()
        self.assertEqual(learned["preferred_select"], "gaze")
        self.assertEqual(learned["events_counted"], 12)
        self.assertEqual(learned["dwell_ms"], 1100)
        self.assertEqual(store._input_events[0]["session_id"], "gaze-test")

if __name__ == "__main__":
    unittest.main()

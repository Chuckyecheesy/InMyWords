"""Photo subagents (T4.2): staff photo -> resident picture tile. Offline."""

import asyncio
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "mcp"))
os.environ["DATABASE_URL"] = ""
os.environ["IMW_RUNTIME_FILE"] = str(Path(tempfile.mkdtemp()) / "runtime.json")

from agents.photos import wiring  # noqa: E402
from agents.photos.checker import CATEGORIES, check_photo, check_prompt  # noqa: E402
from agents.photos.tiler import clean_label, decide  # noqa: E402

TILES = [{"id": 1, "label": "coffee", "category": "food & drink", "cloudinary_id": "tiles/marcus_coffee"}]


def report(**k):
    base = {"shows": "coffee mug", "matches_label": True, "category": "food & drink",
            "clear": True, "concern": ""}
    return {**base, **k}


class TilerTests(unittest.TestCase):
    def test_clean_label(self):
        self.assertEqual(clean_label("  Hot   Chocolate!! "), "hot chocolate")
        self.assertEqual(clean_label("my red bike at the park"), "my red bike")

    def test_matching_photo_saves(self):
        d = decide("Swimming", report(shows="pool", category="activities"), TILES, confirmed=False)
        self.assertEqual(d["action"], "save")
        self.assertEqual((d["label"], d["category"], d["replaces"]), ("swimming", "activities", False))

    def test_same_label_replaces_photo(self):
        self.assertTrue(decide("Coffee", report(), TILES, confirmed=False)["replaces"])

    def test_mismatch_needs_review_with_reason(self):
        d = decide("coffee", report(shows="a cat", matches_label=False), TILES, confirmed=False)
        self.assertEqual(d["action"], "review")
        self.assertIn('looks like "a cat"', d["reasons"][0])

    def test_privacy_concern_needs_review(self):
        d = decide("letter", report(concern="Shows a home address."), TILES, confirmed=False)
        self.assertEqual(d["action"], "review")
        self.assertIn("Shows a home address.", d["reasons"])

    def test_staff_confirmation_overrides_review(self):
        d = decide("coffee", report(matches_label=False), TILES, confirmed=True)
        self.assertEqual(d["action"], "save")

    def test_no_check_saves_with_staff_label(self):
        d = decide("Swimming", None, TILES, confirmed=False)
        self.assertEqual((d["action"], d["checked"], d["category"]), ("save", False, "things"))

    def test_empty_label_is_an_error(self):
        self.assertEqual(decide("  ", report(), TILES, confirmed=False)["action"], "error")


class CheckerTests(unittest.TestCase):
    def test_sends_image_and_cleans_output(self):
        seen = {}

        def generate(prompt, schema, images):
            seen.update(prompt=prompt, images=images)
            return {"shows": "a mug of coffee", "matches_label": True, "category": "weird",
                    "clear": True, "concern": ""}

        out = check_photo(b"jpg", "image/jpeg", "coffee", generate=generate)
        self.assertEqual(seen["images"], [(b"jpg", "image/jpeg")])
        self.assertIn('"coffee"', seen["prompt"])
        self.assertIsNone(out["category"])  # not an allowed category -> dropped

    def test_prompt_never_identifies_people(self):
        self.assertIn("Never guess who a person is", check_prompt("Lisa"))
        self.assertIn("things", CATEGORIES)


class WiringTests(unittest.TestCase):
    def run_add(self, check_result, *, confirmed=False, resident=None):
        saved = []

        async def profile(rid):
            return resident if resident is not None else {"name": "Marcus", "tiles": TILES}

        async def save(rid, label, cid, category):
            saved.append((rid, label, cid, category))
            return {"tile": {"id": 9, "label": label, "category": category, "cloudinary_id": cid},
                    "replaced": False}

        async def check(pid, label):
            return check_result

        out = asyncio.run(wiring.add_photo_tile("marcus", "staff/abc123", "Swimming",
                                                confirmed=confirmed, check=check,
                                                profile=profile, save=save))
        return out, saved

    def test_good_photo_is_saved_as_tile(self):
        out, saved = self.run_add(report(shows="pool", category="activities"))
        self.assertEqual(out["status"], "saved")
        self.assertEqual(saved, [("marcus", "swimming", "staff/abc123", "activities")])

    def test_wrong_photo_saves_nothing_until_confirmed(self):
        out, saved = self.run_add(report(shows="a cat", matches_label=False))
        self.assertEqual(out["status"], "needs_review")
        self.assertEqual(saved, [])
        out, saved = self.run_add(report(shows="a cat", matches_label=False), confirmed=True)
        self.assertEqual(out["status"], "saved")
        self.assertEqual(len(saved), 1)

    def test_unknown_resident(self):
        out, saved = self.run_add(report(), resident={"error": "nope"})
        self.assertEqual(out["status"], "error")
        self.assertEqual(saved, [])

    def test_check_failure_falls_back_to_staff_label(self):
        async def broken_fetch(pid):
            raise RuntimeError("cloudinary down")

        with mock.patch.dict(os.environ, {"GEMINI_API_KEY": "x"}):
            got = asyncio.run(wiring.run_check("staff/abc", "swimming", fetch=broken_fetch,
                                               generate=lambda *a: {}))
        self.assertIsNone(got)


class SeedStoreTileTests(unittest.TestCase):
    def test_new_tile_then_replace_photo(self):
        import store
        s = store.SeedStore()
        n = len(s.get_resident("marcus")["tiles"])
        tile, replaced = s.save_tile("marcus", "swimming", "activities", "staff/pool1")
        self.assertFalse(replaced)
        self.assertEqual(len(s.get_resident("marcus")["tiles"]), n + 1)
        tile, replaced = s.save_tile("marcus", "Coffee", None, "staff/mug2")
        self.assertTrue(replaced)
        coffee = [t for t in s.get_resident("marcus")["tiles"] if t["label"] == "coffee"]
        self.assertEqual([t["cloudinary_id"] for t in coffee], ["staff/mug2"])
        self.assertEqual(coffee[0]["category"], "food & drink")  # kept
        # Another process (the API, the other MCP servers) sees the same tiles.
        other = store.SeedStore()
        self.assertIn("swimming", [t["label"] for t in other.get_resident("marcus")["tiles"]])


class RouteTests(unittest.TestCase):
    def post(self, body, check):
        from fastapi.testclient import TestClient
        import main as api_main

        async def profile(rid):
            return {"name": "Marcus", "tiles": TILES}

        async def save(rid, label, cid, category=""):
            return {"tile": {"id": 9, "label": label, "category": category, "cloudinary_id": cid},
                    "replaced": False}

        async def fake_check(pid, label):
            return check

        with mock.patch.object(wiring.mcp_client, "get_profile", profile), \
             mock.patch.object(wiring.mcp_client, "save_tile", save), \
             mock.patch.object(wiring, "run_check", fake_check):
            return TestClient(api_main.app).post("/media/photos", json=body)

    def test_saved_keeps_old_fields(self):
        r = self.post({"resident_id": "marcus", "public_id": "staff/abc", "label": "Pool"},
                      report(shows="pool", category="activities"))
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual((body["status"], body["cloudinary_id"], body["tile"]["label"]),
                         ("saved", "staff/abc", "pool"))

    def test_needs_review(self):
        r = self.post({"resident_id": "marcus", "public_id": "staff/abc", "label": "coffee"},
                      report(shows="a cat", matches_label=False))
        self.assertEqual(r.json()["status"], "needs_review")

    def test_url_rejected(self):
        r = self.post({"resident_id": "marcus", "public_id": "https://evil.example/x.jpg",
                       "label": "x"}, report())
        self.assertEqual(r.status_code, 400)


if __name__ == "__main__":
    unittest.main()

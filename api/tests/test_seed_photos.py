"""T4.2 seed photos — messy phone snaps become the seeded public ids."""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.seed_photos import (  # noqa: E402
    PRESET_NAME,
    generate_all_messy_photos,
    make_messy_photo,
    process_seed_photos,
    seed_public_ids,
)

ROOT = Path(__file__).resolve().parents[2]


class SeedPublicIdTests(unittest.TestCase):
    def test_seed_ids_cover_marcus_dana_and_choice_extras(self):
        ids = seed_public_ids()
        self.assertIn("tiles/marcus_coffee", ids)
        self.assertIn("tiles/dana_garden", ids)
        self.assertIn("story/marcus_portrait", ids)
        self.assertIn("tiles/marcus_movie", ids)
        self.assertEqual(len(ids), len(set(ids)))

        for name in ("marcus.json", "dana.json"):
            data = json.loads((ROOT / "db" / "seed" / name).read_text(encoding="utf-8"))
            for tile in data["tiles"]:
                self.assertIn(tile["cloudinary_id"], ids)
            for chapter in data["story_chapters"]:
                for photo_id in chapter["photo_ids"]:
                    self.assertIn(photo_id, ids)


class MessyPhotoTests(unittest.TestCase):
    def test_messy_photo_is_a_non_square_jpeg(self):
        from PIL import Image

        path = make_messy_photo("tiles/marcus_coffee")
        self.assertTrue(path.exists())
        with Image.open(path) as image:
            self.assertEqual(image.format, "JPEG")
            self.assertNotEqual(image.size[0], image.size[1])
            self.assertGreater(image.size[0], 600)

    def test_process_without_upload_writes_every_seed_photo(self):
        result = process_seed_photos({}, upload=False)
        self.assertEqual(result["uploaded"], [])
        self.assertIsNone(result["upload_preset"])
        self.assertEqual(len(result["photos"]), len(result["public_ids"]))
        for relative in result["photos"]:
            self.assertTrue((ROOT / relative).exists())


class PresetNameTests(unittest.TestCase):
    def test_unsigned_preset_name_is_staff_photos(self):
        self.assertEqual(PRESET_NAME, "staff_photos")


if __name__ == "__main__":
    unittest.main()

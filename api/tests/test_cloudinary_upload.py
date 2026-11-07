"""T4.2 Cloudinary upload. Written before the upload helper exists.

Staff upload is unsigned: the browser receives a cloud name and a preset,
never the API secret. The id saved for T2 is a public id, not a full URL.
"""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.cloudinary import (  # noqa: E402
    CloudinaryConfigError,
    PublicIdError,
    normalize_public_id,
    photo_record,
    save_photo_record,
    unsigned_upload_params,
)

ROOT = Path(__file__).resolve().parents[2]


class UnsignedUploadTests(unittest.TestCase):
    def test_params_are_cloud_name_and_preset_only(self):
        params = unsigned_upload_params(
            {
                "CLOUDINARY_CLOUD_NAME": " inmywords ",
                "CLOUDINARY_UPLOAD_PRESET": " staff_photos ",
                "CLOUDINARY_API_KEY": "12345",
                "CLOUDINARY_API_SECRET": "super-secret",
            }
        )
        self.assertEqual(
            params,
            {"cloud_name": "inmywords", "upload_preset": "staff_photos"},
        )
        self.assertEqual(set(params), {"cloud_name", "upload_preset"})
        blob = json.dumps(params)
        self.assertNotIn("super-secret", blob)
        self.assertNotIn("12345", blob)

    def test_missing_preset_or_cloud_is_refused(self):
        with self.assertRaises(CloudinaryConfigError):
            unsigned_upload_params({"CLOUDINARY_CLOUD_NAME": "inmywords"})
        with self.assertRaises(CloudinaryConfigError):
            unsigned_upload_params(
                {
                    "CLOUDINARY_CLOUD_NAME": "   ",
                    "CLOUDINARY_UPLOAD_PRESET": "staff_photos",
                }
            )


class PublicIdTests(unittest.TestCase):
    def test_public_id_strips_wrapping_slashes(self):
        self.assertEqual(
            normalize_public_id(" /tiles/marcus_coffee/ "),
            "tiles/marcus_coffee",
        )

    def test_a_url_or_empty_id_or_traversal_is_refused(self):
        refused = [
            "",
            "   ",
            "https://res.cloudinary.com/inmywords/image/upload/tiles/marcus_coffee",
            "../tiles/marcus_coffee",
            "tiles/marcus coffee",
        ]
        for value in refused:
            with self.subTest(value=value):
                with self.assertRaises(PublicIdError):
                    normalize_public_id(value)

    def test_seed_photo_ids_are_safe_to_store(self):
        for name in ("marcus.json", "dana.json"):
            data = json.loads((ROOT / "db" / "seed" / name).read_text(encoding="utf-8"))
            ids = [tile["cloudinary_id"] for tile in data["tiles"]]
            for chapter in data["story_chapters"]:
                ids.extend(chapter["photo_ids"])
            for public_id in ids:
                with self.subTest(file=name, public_id=public_id):
                    self.assertEqual(normalize_public_id(public_id), public_id)


class PhotoRecordTests(unittest.TestCase):
    def test_record_uses_the_normalized_public_id(self):
        record = photo_record(
            resident_id=" marcus ",
            public_id=" /tiles/marcus_coffee ",
            label=" coffee ",
        )
        self.assertEqual(
            record,
            {
                "resident_id": "marcus",
                "cloudinary_id": "tiles/marcus_coffee",
                "label": "coffee",
            },
        )

    def test_a_blank_label_is_stored_as_none(self):
        record = photo_record(
            resident_id="marcus",
            public_id="tiles/marcus_coffee",
            label="  ",
        )
        self.assertIsNone(record["label"])

    def test_save_appends_the_record_the_backend_will_keep(self):
        store = []
        record = photo_record(
            resident_id="marcus",
            public_id="tiles/marcus_coffee",
            label="coffee",
        )
        saved = save_photo_record(record, store)
        self.assertEqual(saved, record)
        self.assertEqual(store, [record])


if __name__ == "__main__":
    unittest.main()

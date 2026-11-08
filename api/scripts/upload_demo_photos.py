#!/usr/bin/env python3
"""Upload the saved demo photos with the Cloudinary Upload API.

The resident screens deliver those public ids through the tile recipe
(square crop, background removal, pad, rounded corners, f_auto/q_auto).
This sends the bytes. It prints public ids and counts, never credentials.

    python -m scripts.upload_demo_photos
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))

from services.seed_photos import (  # noqa: E402
    configure_cloudinary,
    demo_photo_files,
    upload_seed_photo,
    warm_tile_urls,
)


def main() -> int:
    env = dict(os.environ)
    photos = demo_photo_files(ROOT)
    if not photos:
        print("No demo JPEGs under web/public/demo.")
        return 1
    try:
        cfg = configure_cloudinary(env)
    except RuntimeError as exc:
        print(exc)
        return 1

    uploaded: list[str] = []
    for public_id, path in photos:
        upload_seed_photo(public_id, path)
        uploaded.append(public_id)
        print(public_id)

    still = warm_tile_urls(cfg["cloud_name"], uploaded, rounds=3)
    print(f"Uploaded {len(uploaded)} photos to {cfg['cloud_name']}.")
    if still:
        print(f"{still} delivery URLs were still processing.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

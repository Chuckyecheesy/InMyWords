#!/usr/bin/env python3
"""Generate messy seed photos and upload them to Cloudinary (T4.2).

Usage (from repo root, with .env filled in):
    api/.venv/bin/python api/scripts/process_seed_photos.py
    api/.venv/bin/python api/scripts/process_seed_photos.py --dry-run

Prints the public ids for T2 after a successful upload, and writes
CLOUDINARY_UPLOAD_PRESET into .env when the unsigned preset is created.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
API = ROOT / "api"
sys.path.insert(0, str(API))

from services.seed_photos import PRESET_NAME, process_seed_photos  # noqa: E402


def load_env() -> dict[str, str]:
    env = dict(os.environ)
    path = ROOT / ".env"
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#") or "=" not in trimmed:
            continue
        key, _, value = trimmed.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        env.setdefault(key, value)
    return env


def upsert_env(key: str, value: str) -> None:
    path = ROOT / ".env"
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    prefix = f"{key}="
    replaced = False
    out: list[str] = []
    for line in lines:
        if line.strip().startswith(prefix):
            out.append(f"{key}={value}")
            replaced = True
        else:
            out.append(line)
    if not replaced:
        if out and out[-1].strip():
            out.append("")
        out.append(f"{key}={value}")
    path.write_text("\n".join(out) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only generate local JPEGs; do not call Cloudinary.",
    )
    args = parser.parse_args()
    env = load_env()

    try:
        result = process_seed_photos(env, upload=not args.dry_run)
    except Exception as exc:
        print(f"Seed photo processing failed: {exc}", file=sys.stderr)
        print(
            "Open Cloudinary → Settings → API Keys and copy Cloud name, API Key, "
            "and API Secret into the repo-root .env so they match one product environment.",
            file=sys.stderr,
        )
        return 1

    print(f"Generated {len(result['photos'])} messy photos under db/seed/photos/")
    if args.dry_run:
        print("Dry run only — nothing uploaded.")
        return 0

    preset = result["upload_preset"] or PRESET_NAME
    upsert_env("CLOUDINARY_UPLOAD_PRESET", preset)
    print(f"Cloud: {result['cloud_name']}")
    print(f"Unsigned upload preset: {preset} (written to .env)")
    print(f"Uploaded {len(result['uploaded'])} assets. Public ids for T2:")
    for public_id in result["uploaded"]:
        print(f"  {public_id}")
    leftover = result.get("still_warming", 0)
    if leftover:
        print(
            f"Warning: {leftover} tile URLs still warming (423). "
            "Reload Speak For Me in a minute."
        )
    else:
        print("Calm and contrast tile URLs are warm — matching tiles are ready.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

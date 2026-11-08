#!/usr/bin/env python3
"""Print the Cloudinary cloud name the API key can use. Nothing else."""

from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.seed_photos import resolve_cloud_name  # noqa: E402


def main() -> int:
    try:
        print(resolve_cloud_name(dict(os.environ)))
    except RuntimeError as exc:
        print(exc, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

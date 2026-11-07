"""Small in-memory limits for the public suggest route."""

from __future__ import annotations

import time
from collections import defaultdict

_WINDOW_SECONDS = 60
_MAX_PER_WINDOW = 30
_hits: dict[str, list[float]] = defaultdict(list)


def allow(key: str, *, now: float | None = None, limit: int = _MAX_PER_WINDOW) -> bool:
    """True when this key is still inside its per-minute budget."""
    moment = time.monotonic() if now is None else now
    recent = [stamp for stamp in _hits[key] if moment - stamp < _WINDOW_SECONDS]
    if len(recent) >= limit:
        _hits[key] = recent
        return False
    recent.append(moment)
    _hits[key] = recent
    return True

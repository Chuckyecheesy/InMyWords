"""Routine finder (T4.6). Grouping and counting are plain code. The model
only phrases the result, and never sets the count."""

from collections import defaultdict
from datetime import datetime


def find_routines(events: list[dict], *, phrase, min_count: int = 3) -> list[dict]:
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for event in events:
        at = datetime.fromisoformat(event["at"])
        groups[(event["content"], at.strftime("%A"), at.hour)].append(event)

    found: list[dict] = []
    for (content, weekday, hour), items in groups.items():
        if len(items) < min_count:
            continue
        group = {"content": content, "weekday": weekday, "hour": hour,
                 "count": len(items)}
        found.append({
            **group,
            "content": phrase(group),
            "status": "pending",
            "source": "inferred",
            "label": "pattern noticed",
        })
    return sorted(found, key=lambda r: -r["count"])

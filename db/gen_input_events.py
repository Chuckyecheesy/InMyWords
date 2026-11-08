"""Generate db/seed/input_events.json — 14 days of gaze/gesture/touch history
(GAZE_GESTURE_PLAN §6/§7.3). Deterministic (fixed RNG seed) so the demo
profile always matches the worked example in §4.7:

  Marcus: gaze 120 selects / 102 confirmed (85%), touch 30/21 (70%),
          approvals 88 Thumb_Up + 12 touch, median confirmed gaze hold
          950 ms -> dwell 1045 ms, evening gaze ~62% -> "offer touch".
  Dana:   mostly touch (90%), a few failed gaze attempts, approves by touch.

Run:  python db/gen_input_events.py     (rewrites db/seed/input_events.json)
"""

import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

OUT = Path(__file__).parent / "seed" / "input_events.json"
rng = random.Random(42)

# 14 days ending the day before the demo
END = datetime(2026, 11, 7, tzinfo=timezone.utc)
DAYS = [END - timedelta(days=d) for d in range(13, -1, -1)]

WINDOW_HOURS = {"morning": (7, 11), "afternoon": (12, 16), "evening": (18, 21)}

MARCUS_TILES = ["coffee", "tea", "bowling", "Raptors", "park", "music", "bus", "quiet", "Lisa"]
DANA_TILES = ["garden", "sister", "groceries", "tea", "walk", "money", "TV", "herbs"]

events = []


def ts_in(day, window):
    lo, hi = WINDOW_HOURS[window]
    hour = rng.randint(lo, hi)
    return day.replace(hour=hour, minute=rng.randint(0, 59), second=rng.randint(0, 59))


def add(resident, day, window, input_type, action, target, hold_ms, outcome,
        gesture=None, confidence=None):
    t = ts_in(day, window)
    events.append({
        "ts": t.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "resident_id": resident,
        "session_id": f"s-{resident}-{t.strftime('%m%d')}-{window[:2]}",
        "input_type": input_type,
        "action": action,
        "target": target,
        "hold_ms": hold_ms,
        "gesture": gesture,
        "confidence": round(confidence if confidence is not None else rng.uniform(0.75, 0.95), 2),
        "outcome": outcome,
    })


def spread(n, over):
    """n items spread across the list `over`, round-robin with jitter."""
    return [over[i % len(over)] for i in rng.sample(range(len(over) * ((n // len(over)) + 1)), n)]


def confirmed_holds(n, median):
    """n hold values whose percentile_cont(0.5) is exactly `median`."""
    half = (n - 1) // 2
    lows = [median - rng.randint(60, 220) for _ in range(half)]
    highs = [median + rng.randint(60, 320) for _ in range(half)]
    mids = [median] if n % 2 == 1 else [median, median]
    values = lows + mids + highs
    rng.shuffle(values)
    return values[:n]


# ---- Marcus: gaze-first ----
# Evening gaze: 40 selects, 25 confirmed (62.5%). Other windows: 80 selects, 77 confirmed.
marcus_conf_holds = confirmed_holds(102, 950)
hold_iter = iter(marcus_conf_holds)

def marcus_gaze(day_slice, window_pool, n, n_confirmed):
    outcomes = ["confirmed"] * n_confirmed + ["cancelled"] * ((n - n_confirmed) // 2) \
               + ["timeout"] * (n - n_confirmed - (n - n_confirmed) // 2)
    rng.shuffle(outcomes)
    for i, outcome in enumerate(outcomes):
        day = day_slice[i % len(day_slice)]
        window = window_pool[i % len(window_pool)]
        hold = next(hold_iter) if outcome == "confirmed" else rng.randint(400, 850)
        add("marcus", day, window, "gaze", "select", MARCUS_TILES[i % len(MARCUS_TILES)],
            hold, outcome)

marcus_gaze(DAYS, ["morning", "afternoon"], 80, 77)
marcus_gaze(DAYS, ["evening"], 40, 25)

for i in range(30):  # touch selects, 21 confirmed (70%)
    outcome = "confirmed" if i < 21 else "cancelled"
    add("marcus", DAYS[i % 14], rng.choice(["morning", "afternoon", "evening"]),
        "touch", "select", MARCUS_TILES[i % len(MARCUS_TILES)], 0, outcome, confidence=1.0)

for i in range(88):  # thumbs-up approvals, 82 confirmed (93%)
    outcome = "confirmed" if i < 82 else "cancelled"
    add("marcus", DAYS[i % 14], rng.choice(["morning", "afternoon", "evening"]),
        "gesture", "approve", "suggestion", rng.randint(500, 900), outcome,
        gesture="Thumb_Up", confidence=rng.uniform(0.7, 0.98))

for i in range(12):  # touch approvals
    add("marcus", DAYS[i % 14], rng.choice(["morning", "afternoon"]),
        "touch", "approve", "suggestion", 0, "confirmed", confidence=1.0)

# ---- Dana: touch-first ----
for i in range(60):  # touch selects, 54 confirmed (90%)
    outcome = "confirmed" if i < 54 else "cancelled"
    add("dana", DAYS[i % 14], rng.choice(["morning", "afternoon", "evening"]),
        "touch", "select", DANA_TILES[i % len(DANA_TILES)], 0, outcome, confidence=1.0)

for i in range(8):  # a few gaze attempts, mostly cancelled
    outcome = "confirmed" if i < 2 else "cancelled"
    add("dana", DAYS[(i * 2) % 14], "afternoon", "gaze", "select",
        DANA_TILES[i % len(DANA_TILES)], rng.randint(600, 1400), outcome)

for i in range(30):  # touch approvals
    add("dana", DAYS[i % 14], rng.choice(["morning", "afternoon"]),
        "touch", "approve", "suggestion", 0, "confirmed", confidence=1.0)

events.sort(key=lambda e: e["ts"])
OUT.write_text(json.dumps({"input_events": events}, indent=1), encoding="utf-8")
print(f"Wrote {len(events)} events to {OUT}")
marcus_total = sum(1 for e in events if e["resident_id"] == "marcus")
print(f"  marcus: {marcus_total} (gaze selects 120, touch selects 30, approvals 100)")
print(f"  dana:   {len(events) - marcus_total}")

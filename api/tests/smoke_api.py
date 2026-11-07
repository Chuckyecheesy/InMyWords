"""Full-contract smoke test (T2.8): hits every endpoint in docs/CONTRACTS.md
against a running stack and checks status + response shape.

Start the stack first (each in its own terminal, or see README):
    python mcp/profile_server.py
    python mcp/emh_server.py
    python mcp/memory_server.py
    python mcp/actions_server.py
    cd api && uvicorn main:app --port 8000

Then:  python api/tests/smoke_api.py
Exits 0 only if every endpoint passes.
"""

import json
import sys
import urllib.request

BASE = "http://127.0.0.1:8000"
failures = []


def hit(method, path, body=None, expect_keys=()):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode())
        missing = [k for k in expect_keys if k not in payload]
        if missing:
            failures.append(f"{method} {path}: missing keys {missing}")
            print(f"  FAIL {method} {path} — missing {missing}")
        else:
            print(f"  ok   {method} {path}")
        return payload
    except Exception as exc:
        failures.append(f"{method} {path}: {exc}")
        print(f"  FAIL {method} {path} — {exc}")
        return {}


print("residents + speak-for-me")
hit("GET", "/residents/marcus", expect_keys=("name", "voice_id", "tiles", "communication_style"))
hit("PUT", "/residents/marcus/voice", {"voice_id": "voice_marcus_1"}, ("ok",))
hit("POST", "/suggest", {"resident_id": "marcus", "tiles": ["coffee", "now"], "time": "morning"},
    ("options",))
hit("POST", "/speak", {"resident_id": "marcus", "text": "Can I get a double-double?"}, ("audio_url",))
hit("POST", "/sentences", {"resident_id": "marcus", "tiles": ["coffee"],
                           "chosen_text": "Coffee please", "approved": True}, ("id",))

print("story")
hit("POST", "/story/answer", {"resident_id": "marcus", "chapter": "about_me",
                              "question": "What do you love?", "answer": "bowling"}, ("ok",))
hit("POST", "/story/draft", {"resident_id": "marcus", "chapter": "about_me"}, ("text",))
hit("POST", "/story/approve", {"chapter_id": 1}, ("audio_url",))
hit("GET", "/story/marcus", expect_keys=("chapters",))

print("coach + choices")
coach = hit("POST", "/coach/ask", {"resident_id": "marcus", "question": "what upsets Marcus"},
            ("answer", "sources"))
if coach and not coach.get("sources") and "don't know" not in coach.get("answer", ""):
    failures.append("coach/ask: answer has no sources and is not an honest unknown")
hit("POST", "/choices", {"resident_id": "marcus", "question": "Saturday?",
                         "options": [{"label": "bowling", "cost": 15}, {"label": "movie", "cost": 12}]},
    ("options",))
hit("POST", "/choices/1/decide", {"chosen": "not_yet_decided"}, ("ok",))

print("actions")
plan = hit("POST", "/actions/plan", {"resident_id": "marcus", "goal": "bowling Saturday"},
           ("online_steps", "staff_tasks", "total_cost"))
plan_id = plan.get("plan_id", 501)
hit("POST", f"/actions/{plan_id}/approve", {}, ("results",))

print("memory")
pending = hit("GET", "/memories/pending/marcus", expect_keys=("memories",))
if pending.get("memories"):
    mem_id = pending["memories"][0]["id"]
    hit("POST", f"/memories/{mem_id}/confirm", {"confirmed": True, "resident_id": "marcus"}, ("ok",))
else:
    print("  note: confirm skipped (queue empty — fine after repeated runs)")

print("staff")
hit("GET", "/handoff?staff_id=jordan&resident_id=marcus", expect_keys=("items",))
hit("GET", "/activity/marcus", expect_keys=("items",))
hit("POST", "/observations", {"resident_id": "marcus", "staff_id": "sam",
                              "note": "Calm morning, two teas."}, ("ok",))

print()
if failures:
    print(f"{len(failures)} FAILURE(S):")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print("ALL CONTRACT ENDPOINTS PASS")

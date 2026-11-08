"""T1.8: measure the demo's latency against the targets (CLAUDE.md / BUILD_PLAN §4).

    python -m scripts.latency                   # the live VM (from ops/host)
    python -m scripts.latency http://127.0.0.1:8000

Targets:
  tiles -> suggestions          < 3 s    POST /suggest
  approve -> audio (cached)     < 2 s    POST /speak, a pre-generated line, then fetch the mp3
  approve -> audio (new line)   < 2 s    POST /speak, a line that is not cached yet
  Coach answer                  < 4 s    POST /coach/ask
  voice agent session (info)   ,        GET /agents/story/session

Only read routes and the speech cache are touched: nothing is saved as a
resident's words. The "new line" check makes one short ElevenLabs request
per run, and /suggest makes Gemini calls, so keep runs small.
"""

from __future__ import annotations

import statistics
import sys
import time
from pathlib import Path

import httpx

HOST_FILE = Path(__file__).resolve().parents[2] / "ops" / "host"
RUNS = 3


def base_url() -> str:
    if len(sys.argv) > 1:
        return sys.argv[1].rstrip("/")
    return f"https://api.{HOST_FILE.read_text().strip().replace('.', '-')}.sslip.io"


def timed(client: httpx.Client, method: str, path: str, **kwargs) -> tuple[float, httpx.Response]:
    start = time.perf_counter()
    resp = client.request(method, path, **kwargs)
    return time.perf_counter() - start, resp


def speak_and_fetch(client: httpx.Client, text: str) -> tuple[float, bool]:
    start = time.perf_counter()
    resp = client.post("/speak", json={"resident_id": "marcus", "text": text})
    resp.raise_for_status()
    body = resp.json()
    if "example.com" in body["audio_url"]:
        raise RuntimeError("/speak returned the mock URL: no ElevenLabs key on the server")
    client.get(body["audio_url"]).raise_for_status()  # the browser fetches the file too
    return time.perf_counter() - start, bool(body.get("cached"))


def main() -> None:
    base = base_url()
    print(f"Measuring {base} ({RUNS} runs each, median)\n")
    rows: list[tuple[str, float | None, float | None, str]] = []
    with httpx.Client(base_url=base, timeout=30) as client:
        def check(name: str, target: float | None, fn) -> None:
            samples, note = [], ""
            for _ in range(RUNS):
                try:
                    seconds, extra = fn()
                    samples.append(seconds)
                    note = extra or note
                except Exception as exc:  # report, keep measuring the rest
                    note = f"ERROR {type(exc).__name__}: {exc}"[:90]
                    break
            rows.append((name, statistics.median(samples) if samples else None, target, note))

        def suggest():
            s, r = timed(client, "POST", "/suggest", json={"resident_id": "marcus", "tiles": ["coffee", "now"]})
            r.raise_for_status()
            return s, f"{len(r.json().get('options', []))} options"

        def speak_cached():
            s, cached = speak_and_fetch(client, "Can I get a double-double from Tim's?")
            return s, "cached" if cached else "NOT cached (run scripts.pregenerate)"

        def speak_new():
            s, cached = speak_and_fetch(client, f"Latency check {time.time_ns() % 10**8}.")
            return s, "cached?!" if cached else "generated"

        def coach():
            s, r = timed(client, "POST", "/coach/ask",
                         json={"resident_id": "marcus", "question": "What upsets Marcus?"})
            r.raise_for_status()
            return s, f"{len(r.json().get('sources', []))} sources"

        def session():
            s, r = timed(client, "GET", "/agents/story/session")
            return s, f"HTTP {r.status_code}"

        check("tiles -> suggestions", 3.0, suggest)
        check("approve -> audio (cached)", 2.0, speak_cached)
        check("approve -> audio (new line)", 2.0, speak_new)
        check("Coach answer", 4.0, coach)
        check("voice agent session", None, session)

    failed = False
    for name, median, target, note in rows:
        if median is None:
            verdict, failed = "FAIL", True
        elif target is None:
            verdict = "info"
        else:
            verdict = "ok" if median < target else "SLOW"
            failed |= verdict == "SLOW"
        shown = f"{median:5.2f}s" if median is not None else "  ,  "
        goal = f"< {target:.0f}s" if target else "     "
        print(f"  {verdict:4}  {name:30} {shown}  {goal}  {note}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

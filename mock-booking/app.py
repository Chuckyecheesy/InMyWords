"""Mock booking site (BUILD_PLAN T2.6) — shows that a booking landed.

Run:  python mock-booking/app.py          (http://127.0.0.1:8200)

Reads the bookings table through the shared store (Postgres when
DATABASE_URL is set, the seed runtime file otherwise). Auto-refreshes
every 3 seconds so the demo shows the row appear right after approval.
"""

import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "mcp"))
from store import get_store  # noqa: E402

app = FastAPI(title="KW Bowl (mock)")

PAGE = """<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="refresh" content="3">
<title>KW Bowl — bookings</title>
<style>
 body {{ font-family: system-ui, sans-serif; background:#f4f1ea; margin:0; padding:2rem; }}
 h1 {{ color:#7a2d2d; }} .tag {{ color:#777; font-size:.9rem; }}
 table {{ border-collapse: collapse; background:#fff; width:100%; max-width:640px;
         box-shadow:0 1px 4px rgba(0,0,0,.15); }}
 th, td {{ text-align:left; padding:.7rem 1rem; border-bottom:1px solid #eee; }}
 th {{ background:#7a2d2d; color:#fff; }}
 .empty {{ padding:2rem; color:#999; }}
</style></head><body>
<h1>🎳 KW Bowl</h1>
<p class="tag">Mock booking site — our own, because real booking sites are unreliable to automate live. Auto-refreshes.</p>
{table}
</body></html>"""


@app.get("/", response_class=HTMLResponse)
def bookings_page():
    rows = get_store().get_bookings()
    if not rows:
        table = '<div class="empty">No bookings yet — approve a plan and watch this page.</div>'
    else:
        body = "".join(
            f"<tr><td>{b['id']}</td><td>{b['resident_id'].capitalize()}</td>"
            f"<td>{b['activity']}</td><td>{str(b['starts_at'])[:16].replace('T', ' ')}</td></tr>"
            for b in rows)
        table = ("<table><tr><th>#</th><th>Name</th><th>Activity</th><th>When</th></tr>"
                 f"{body}</table>")
    return PAGE.format(table=table)


if __name__ == "__main__":
    import os
    import uvicorn
    # Local default :8200; on Railway bind the public $PORT.
    uvicorn.run(app, host="0.0.0.0" if os.environ.get("PORT") else "127.0.0.1",
                port=int(os.environ.get("PORT", 8200)))

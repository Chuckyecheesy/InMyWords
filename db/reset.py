"""Reset demo data with one command (BUILD_PLAN T2.2).

Wipes and reloads everything: schema, homes/staff, both residents, tiles,
story chapters, 2 weeks of EMH history, and the seeded memory history
(incl. the pending tea-vs-coffee pattern).

Usage:
    # DATABASE_URL in the environment or in a .env file at repo root
    python db/reset.py

Embeddings are left NULL — backfill them with Ahmed's embedding function
once T3.1 lands (recall uses keyword match until then). After the JSON
seed, William's binder import (api/scripts/import_marcus_binder.py) can
re-run over marcus_binder.md. memories.json already includes the core
document facts so the demo works even before that script runs.
"""

import json
import os
import sys
from pathlib import Path

import psycopg

HERE = Path(__file__).parent


def load_env():
    env_path = HERE.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())


def read_json(name):
    return json.loads((HERE / "seed" / name).read_text(encoding="utf-8"))


def main():
    load_env()
    runtime = HERE / "seed" / ".runtime.json"
    if runtime.exists():
        runtime.unlink()
        print("Cleared seed-mode runtime state (bookings, plans, staff tasks).")
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set (env var or .env at repo root). "
                 "Seed-mode runtime was still cleared.")

    schema = (HERE / "schema.sql").read_text(encoding="utf-8")
    core = read_json("core.json")
    emh = read_json("emh_notes.json")
    mems = read_json("memories.json")

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        print("Applying schema (drops and recreates all tables)...")
        cur.execute(schema)

        for home in core["homes"]:
            cur.execute(
                "INSERT INTO homes (id, name, manager_id) VALUES (%s, %s, %s)",
                (home["id"], home["name"], home["manager_id"]),
            )
        for person in core["staff"]:
            cur.execute(
                "INSERT INTO staff (id, name, role, last_shift_end) VALUES (%s, %s, %s, %s)",
                (person["id"], person["name"], person["role"], person["last_shift_end"]),
            )

        for name in ("marcus.json", "dana.json"):
            data = read_json(name)
            r = data["resident"]
            cur.execute(
                """INSERT INTO residents (id, home_id, first_name, voice_id, communication_style, weekly_budget)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (r["id"], r["home_id"], r["first_name"], r["voice_id"],
                 r["communication_style"], r["weekly_budget"]),
            )
            for tile in data["tiles"]:
                cur.execute(
                    """INSERT INTO tiles (resident_id, label, category, cloudinary_id, times_used)
                       VALUES (%s, %s, %s, %s, %s)""",
                    (r["id"], tile["label"], tile["category"], tile["cloudinary_id"], tile["times_used"]),
                )
            for ch in data["story_chapters"]:
                cur.execute(
                    """INSERT INTO story_chapters (resident_id, chapter_key, text, photo_ids, status)
                       VALUES (%s, %s, %s, %s, %s)""",
                    (r["id"], ch["chapter_key"], ch["text"], ch["photo_ids"], ch["status"]),
                )

        for note in emh["emh_notes"]:
            cur.execute(
                "INSERT INTO emh_notes (resident_id, author, note, created_at) VALUES (%s, %s, %s, %s)",
                (note["resident_id"], note["author"], note["note"], note["created_at"]),
            )
        for row in emh["emh_checklist"]:
            cur.execute(
                "INSERT INTO emh_checklist (home_id, date, item, happened, reason) VALUES (%s, %s, %s, %s, %s)",
                (row["home_id"], row["date"], row["item"], row["happened"], row["reason"]),
            )
        for event in emh["emh_events"]:
            cur.execute(
                "INSERT INTO emh_events (resident_id, event, created_at) VALUES (%s, %s, %s)",
                (event["resident_id"], event["event"], event["created_at"]),
            )

        accounts = read_json("users.json")
        for u in accounts["users"]:
            cur.execute(
                """INSERT INTO users (login_id, role, resident_id, staff_id, display_name, secret_hash)
                   VALUES (%s,%s,%s,%s,%s,%s)""",
                (u["login_id"], u["role"], u["resident_id"], u["staff_id"],
                 u["display_name"], u["secret_hash"]))
        for a in accounts["staff_assignments"]:
            cur.execute(
                "INSERT INTO staff_assignments (staff_id, resident_id) VALUES (%s,%s)",
                (a["staff_id"], a["resident_id"]))

        binder_path = HERE / "seed" / "marcus_binder.md"
        if binder_path.exists():
            cur.execute(
                """INSERT INTO documents (resident_id, title, category, author, doc_date, body)
                   VALUES (%s,%s,%s,%s,%s,%s)""",
                ("marcus", "Resident Information Binder", "binder", "Maple House staff",
                 "2021-03-15", binder_path.read_text(encoding="utf-8")))

        inputs = read_json("input_events.json")["input_events"]
        # The input profile reads a sliding 14-day window. The seed file has
        # fixed dates, so without this shift a day of events ages out every
        # real day and the G5 worked example (dwell ~1045 ms) slowly drifts.
        # Shifting all timestamps so the newest lands today keeps every reset
        # looking like demo day.
        from datetime import date, datetime
        newest = max(datetime.fromisoformat(e["ts"].replace("Z", "+00:00")) for e in inputs)
        shift = date.today() - newest.date()
        for e in inputs:
            ts = (datetime.fromisoformat(e["ts"].replace("Z", "+00:00")) + shift).isoformat()
            cur.execute(
                """INSERT INTO input_events (ts, resident_id, session_id, input_type, action,
                                             target, hold_ms, gesture, confidence, outcome)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (ts, e["resident_id"], e["session_id"], e["input_type"], e["action"],
                 e["target"], e["hold_ms"], e["gesture"], e["confidence"], e["outcome"]))

        for m in mems["memories"]:
            cur.execute(
                """INSERT INTO memories (resident_id, type, content, source, source_date,
                                         times_seen, first_seen, last_seen, status)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (m["resident_id"], m["type"], m["content"], m["source"], m["source_date"],
                 m["times_seen"], m["first_seen"], m["last_seen"], m["status"]),
            )

        conn.commit()

        backfill_embeddings(cur)
        conn.commit()

        cur.execute("SELECT count(*) FROM input_events")
        n_inputs = cur.fetchone()[0]

        cur.execute("SELECT count(*) FROM memories")
        n_mem = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM memories WHERE status = 'pending'")
        n_pending = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM memories WHERE embedding IS NOT NULL")
        n_vec = cur.fetchone()[0]
        print(f"Done. {n_mem} memories seeded ({n_pending} pending confirmation — the tea pattern); "
              f"{n_vec} embedded; {n_inputs} input events.")

    timescale_setup(url)


def timescale_setup(url):
    """Hypertable + continuous aggregate + refresh policy for input_events
    (GAZE_GESTURE_PLAN §6). These can't run inside a transaction, so they
    get their own autocommit connection. Degrades gracefully on plain
    Postgres — the profile query falls back to the raw table."""
    statements = [
        ("hypertable",
         "SELECT create_hypertable('input_events', 'ts', if_not_exists => TRUE, migrate_data => TRUE)"),
        ("daily aggregate",
         """CREATE MATERIALIZED VIEW input_daily
            WITH (timescaledb.continuous) AS
            SELECT time_bucket('1 day', ts) AS day,
                   resident_id, input_type, action,
                   count(*) AS total,
                   count(*) FILTER (WHERE outcome = 'confirmed') AS confirmed,
                   count(*) FILTER (WHERE extract(hour FROM ts) < 12) AS morning,
                   count(*) FILTER (WHERE extract(hour FROM ts) >= 12
                                      AND extract(hour FROM ts) < 17) AS afternoon,
                   count(*) FILTER (WHERE extract(hour FROM ts) >= 17) AS evening,
                   count(*) FILTER (WHERE outcome = 'confirmed'
                                      AND extract(hour FROM ts) >= 17) AS evening_confirmed
            FROM input_events
            GROUP BY day, resident_id, input_type, action
            WITH NO DATA"""),
        ("refresh policy",
         """SELECT add_continuous_aggregate_policy('input_daily',
                start_offset => INTERVAL '3 days', end_offset => INTERVAL '1 hour',
                schedule_interval => INTERVAL '5 minutes', if_not_exists => TRUE)"""),
        ("manual refresh after seeding",
         "CALL refresh_continuous_aggregate('input_daily', NULL, NULL)"),
    ]
    conn = psycopg.connect(url, autocommit=True)
    try:
        for name, sql in statements:
            try:
                conn.execute(sql)
                print(f"Timescale: {name} OK")
            except Exception as exc:
                print(f"Timescale: {name} skipped ({type(exc).__name__}: {str(exc)[:90]})")
    finally:
        conn.close()


def backfill_embeddings(cur):
    """Embed every memory with Ahmed's wrapper (768-d, RETRIEVAL_DOCUMENT) so
    recall gets vector search. Skipped cleanly when GEMINI_API_KEY is absent
    or the call fails — recall falls back to keyword + recency."""
    if not os.environ.get("GEMINI_API_KEY"):
        print("No GEMINI_API_KEY — embeddings left NULL (keyword recall only).")
        return
    try:
        sys.path.insert(0, str(HERE.parent / "api"))
        from services.gemini import embed
        rows = cur.execute("SELECT id, content FROM memories ORDER BY id").fetchall()
        vectors = embed([content for _, content in rows])  # one batched call
        for (mem_id, _), vec in zip(rows, vectors):
            literal = "[" + ",".join(f"{v:.8f}" for v in vec) + "]"
            cur.execute("UPDATE memories SET embedding = %s::vector WHERE id = %s", (literal, mem_id))
        print(f"Embedded {len(rows)} memories (768-d, batched).")
    except Exception as exc:
        print(f"Embedding backfill skipped ({type(exc).__name__}: {exc}) — keyword recall only.")


if __name__ == "__main__":
    main()

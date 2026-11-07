"""Shared data layer for the MCP servers (and the backend).

Two backends, picked automatically:
- PostgresStore  when DATABASE_URL is set and reachable (Tiger Data).
- SeedStore      otherwise — reads db/seed/*.json so every tool works
                 before the database exists. Writes go to memory only
                 (lost on restart) and are clearly marked in the result.

Agents NEVER import this directly — they go through the MCP servers.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SEED_DIR = REPO_ROOT / "db" / "seed"


def _load_env():
    env_path = REPO_ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def source_label(source: str, name: str, date: str | None) -> str:
    """The product's source-label rule, in one place (CLAUDE.md guardrail #2)."""
    if source == "resident":
        return f"In {name}'s words"
    if source == "staff":
        return f"Staff observation, {date or 'undated'}"
    if source == "emh":
        return "From EMH"
    if source == "document":
        year = (date or "")[:4]
        return f"From records, {year}" if year else "From records"
    return "Pattern noticed"  # inferred — never shown as fact


class SeedStore:
    """JSON-backed fallback. Same shapes as PostgresStore."""

    mode = "seed"

    def __init__(self):
        def read(name):
            return json.loads((SEED_DIR / name).read_text(encoding="utf-8"))

        core = read("core.json")
        self.homes = {h["id"]: h for h in core["homes"]}
        self.staff = {s["id"]: s for s in core["staff"]}
        self.residents = {}
        self.tiles = {}
        self.chapters = []
        for name in ("marcus.json", "dana.json"):
            data = read(name)
            rid = data["resident"]["id"]
            self.residents[rid] = data["resident"]
            self.tiles[rid] = [dict(t, id=i + 1) for i, t in enumerate(data["tiles"])]
            for ch in data["story_chapters"]:
                self.chapters.append(dict(ch, id=len(self.chapters) + 1, resident_id=rid, audio_url=None))
        emh = read("emh_notes.json")
        self.emh_notes = emh["emh_notes"]
        self.emh_checklist = emh["emh_checklist"]
        self.emh_events = emh["emh_events"]
        self.memories = [dict(m, id=i + 1) for i, m in enumerate(read("memories.json")["memories"])]
        # In-memory writes (lost on restart — fine for pre-DB development)
        self.sentences, self.choices, self.observations, self.story_answers = [], [], [], []

    # ---- reads ----

    def get_resident(self, rid):
        r = self.residents.get(rid)
        if not r:
            return None
        return dict(r, tiles=self.tiles.get(rid, []))

    def get_story(self, rid):
        return [c for c in self.chapters if c["resident_id"] == rid]

    def get_memories(self, rid, statuses=("confirmed",)):
        return [m for m in self.memories if m["resident_id"] == rid and m["status"] in statuses]

    def search_facts(self, rid, query, limit=8):
        words = [w for w in query.lower().split() if len(w) > 2]
        hits = []
        for m in self.get_memories(rid, ("confirmed", "pending")):
            text = m["content"].lower()
            if any(w in text for w in words):
                hits.append({"content": m["content"], "source": m["source"],
                             "date": m.get("source_date") or m["last_seen"][:10],
                             "status": m["status"], "kind": "memory"})
        for o in self.observations:
            if o["resident_id"] == rid and any(w in o["note"].lower() for w in words):
                hits.append({"content": o["note"], "source": "staff",
                             "date": o["created_at"][:10], "status": "confirmed", "kind": "observation"})
        for n in self.emh_notes:
            if n["resident_id"] == rid and any(w in n["note"].lower() for w in words):
                hits.append({"content": n["note"], "source": "emh",
                             "date": n["created_at"][:10], "status": "confirmed", "kind": "emh_note"})
        return hits[:limit]

    def get_emh_notes(self, rid, since=None):
        notes = [n for n in self.emh_notes if n["resident_id"] == rid]
        if since:
            notes = [n for n in notes if n["created_at"] >= since]
        return notes

    def get_emh_checklist(self, home_id, date=None):
        rows = [c for c in self.emh_checklist if c["home_id"] == home_id]
        if date:
            rows = [c for c in rows if c["date"] == date]
        return rows

    def get_emh_events(self, rid):
        return [e for e in self.emh_events if e["resident_id"] == rid]

    # ---- writes (memory only in seed mode) ----

    def save_story_chapter(self, rid, chapter_key, text, photo_ids):
        ch = {"id": len(self.chapters) + 1, "resident_id": rid, "chapter_key": chapter_key,
              "text": text, "photo_ids": photo_ids, "audio_url": None, "status": "draft"}
        self.chapters.append(ch)
        return ch["id"]

    def log_sentence(self, rid, tiles, chosen_text, approved):
        self.sentences.append({"id": len(self.sentences) + 1, "resident_id": rid, "tiles": tiles,
                               "chosen_text": chosen_text, "approved": approved, "created_at": _now()})
        return self.sentences[-1]["id"]

    def log_choice(self, rid, question, options, chosen, status):
        self.choices.append({"id": len(self.choices) + 1, "resident_id": rid, "question": question,
                             "options": options, "chosen": chosen, "status": status, "created_at": _now()})
        return self.choices[-1]["id"]

    def add_observation(self, rid, staff_id, note):
        self.observations.append({"id": len(self.observations) + 1, "resident_id": rid,
                                  "staff_id": staff_id, "note": note, "created_at": _now()})
        return self.observations[-1]["id"]

    def save_story_answer(self, rid, chapter_key, question, answer):
        self.story_answers.append({"resident_id": rid, "chapter_key": chapter_key,
                                   "question": question, "answer": answer, "created_at": _now()})
        return True


class PostgresStore:
    """Tiger Data backend. Same method signatures/shapes as SeedStore."""

    mode = "postgres"

    def __init__(self, url):
        import psycopg
        from psycopg.rows import dict_row
        self._psycopg = psycopg
        self._dict_row = dict_row
        self.url = url
        with self._conn() as conn:  # fail fast if unreachable
            conn.execute("SELECT 1")

    def _conn(self):
        return self._psycopg.connect(self.url, row_factory=self._dict_row)

    def _all(self, sql, params=()):
        with self._conn() as conn:
            return [dict(r) for r in conn.execute(sql, params).fetchall()]

    def _one(self, sql, params=()):
        with self._conn() as conn:
            row = conn.execute(sql, params).fetchone()
            return dict(row) if row else None

    def get_resident(self, rid):
        r = self._one("SELECT * FROM residents WHERE id = %s", (rid,))
        if not r:
            return None
        r["tiles"] = self._all(
            "SELECT id, label, category, cloudinary_id, times_used FROM tiles "
            "WHERE resident_id = %s ORDER BY times_used DESC", (rid,))
        return r

    def get_story(self, rid):
        return self._all("SELECT * FROM story_chapters WHERE resident_id = %s ORDER BY id", (rid,))

    def get_memories(self, rid, statuses=("confirmed",)):
        return self._all(
            "SELECT * FROM memories WHERE resident_id = %s AND status = ANY(%s) ORDER BY last_seen DESC",
            (rid, list(statuses)))

    def search_facts(self, rid, query, limit=8):
        words = [w for w in query.lower().split() if len(w) > 2] or [query.lower()]
        pattern = "%(" + "|".join(words) + ")%"
        rows = self._all(
            """SELECT content, source, coalesce(source_date::text, last_seen::date::text) AS date,
                      status, 'memory' AS kind
               FROM memories WHERE resident_id = %s AND status IN ('confirmed','pending')
                 AND content ~* %s
               UNION ALL
               SELECT note, 'staff', created_at::date::text, 'confirmed', 'observation'
               FROM observations WHERE resident_id = %s AND note ~* %s
               UNION ALL
               SELECT note, 'emh', created_at::date::text, 'confirmed', 'emh_note'
               FROM emh_notes WHERE resident_id = %s AND note ~* %s
               LIMIT %s""",
            (rid, pattern, rid, pattern, rid, pattern, limit))
        return rows

    def get_emh_notes(self, rid, since=None):
        if since:
            return self._all("SELECT * FROM emh_notes WHERE resident_id = %s AND created_at >= %s "
                             "ORDER BY created_at DESC", (rid, since))
        return self._all("SELECT * FROM emh_notes WHERE resident_id = %s ORDER BY created_at DESC", (rid,))

    def get_emh_checklist(self, home_id, date=None):
        if date:
            return self._all("SELECT * FROM emh_checklist WHERE home_id = %s AND date = %s", (home_id, date))
        return self._all("SELECT * FROM emh_checklist WHERE home_id = %s ORDER BY date DESC", (home_id,))

    def get_emh_events(self, rid):
        return self._all("SELECT * FROM emh_events WHERE resident_id = %s ORDER BY created_at DESC", (rid,))

    def _insert(self, sql, params):
        with self._conn() as conn:
            row = conn.execute(sql + " RETURNING id", params).fetchone()
            conn.commit()
            return row["id"]

    def save_story_chapter(self, rid, chapter_key, text, photo_ids):
        return self._insert(
            "INSERT INTO story_chapters (resident_id, chapter_key, text, photo_ids) VALUES (%s,%s,%s,%s)",
            (rid, chapter_key, text, photo_ids))

    def log_sentence(self, rid, tiles, chosen_text, approved):
        return self._insert(
            "INSERT INTO sentences (resident_id, tiles, chosen_text, approved) VALUES (%s,%s,%s,%s)",
            (rid, tiles, chosen_text, approved))

    def log_choice(self, rid, question, options, chosen, status):
        return self._insert(
            "INSERT INTO choices (resident_id, question, options, chosen, status) VALUES (%s,%s,%s,%s,%s)",
            (rid, question, json.dumps(options), chosen, status))

    def add_observation(self, rid, staff_id, note):
        return self._insert(
            "INSERT INTO observations (resident_id, staff_id, note) VALUES (%s,%s,%s)",
            (rid, staff_id, note))

    def save_story_answer(self, rid, chapter_key, question, answer):
        self._insert(
            "INSERT INTO story_answers (resident_id, chapter_key, question, answer) VALUES (%s,%s,%s,%s)",
            (rid, chapter_key, question, answer))
        return True


_store = None


def get_store():
    """Singleton. Postgres when DATABASE_URL works, seed JSON otherwise."""
    global _store
    if _store is None:
        _load_env()
        url = os.environ.get("DATABASE_URL")
        if url:
            try:
                _store = PostgresStore(url)
            except Exception as exc:  # unreachable DB → still usable for dev
                print(f"[store] DATABASE_URL set but unusable ({exc}); using seed JSON")
                _store = SeedStore()
        else:
            _store = SeedStore()
        print(f"[store] mode = {_store.mode}")
    return _store

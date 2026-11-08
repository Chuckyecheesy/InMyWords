"""Shared data layer for the MCP servers (and the backend).

Two backends, picked automatically:
- PostgresStore  when DATABASE_URL is set and reachable (Tiger Data).
- SeedStore      otherwise, reads db/seed/*.json so every tool works
                 before the database exists. Writes go to memory only
                 (lost on restart) and are clearly marked in the result.

Agents NEVER import this directly, they go through the MCP servers.
"""

from __future__ import annotations

import json
import os
import re
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from retrieval import DUPLICATE_SIM, VectorCache, cosine, keyword_hits, neutralize, query_terms, recency_scores, select

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


def recall_terms(query: str, limit: int = 8, ignore=()) -> list[str]:
    """Meaningful words for literal matching (stopwords dropped). See retrieval.py."""
    return query_terms(query, limit, ignore)


def _name_words(resident) -> tuple:
    """The resident's id and first name: present in most of their facts, so
    useless (and noisy) as keywords."""
    if not resident:
        return ()
    return (resident.get("id"), resident.get("first_name"))


def is_profile_overview_query(query: str) -> bool:
    normalized = re.sub(r"[^a-z0-9\s]", " ", (query or "").lower())
    words = set(normalized.split())
    return bool(
        words & {"onboarding", "overview", "essentials", "introduce"}
        or re.search(r"\bnew\s+staff\b", normalized)
        or re.search(r"\bwhat\s+should\s+(?:new\s+)?staff\s+know\b", normalized)
    )


def _gemini_embed():
    import sys
    api_dir = str(REPO_ROOT / "api")
    if api_dir not in sys.path:
        sys.path.insert(0, api_dir)
    from services.gemini import embed
    return embed


_query_vec_cache: dict[str, list[float]] = {}


def embed_text(text, task_type="RETRIEVAL_QUERY"):
    """Best-effort embedding via Ahmed's wrapper (api/services/gemini.py).
    Returns None when the key is missing or the call fails, callers fall
    back to keyword ranking. Query embeddings are cached (a repeated Coach
    question costs no extra call, which protects the 4s latency budget)."""
    if not os.environ.get("GEMINI_API_KEY") or not (text or "").strip():
        return None
    key = (text or "").strip().lower()
    if task_type == "RETRIEVAL_QUERY" and key in _query_vec_cache:
        return _query_vec_cache[key]
    try:
        vec = _gemini_embed()(text, task_type=task_type)
    except Exception as exc:
        print(f"[store] embed skipped ({type(exc).__name__})")
        return None
    if task_type == "RETRIEVAL_QUERY":
        if len(_query_vec_cache) >= 256:
            _query_vec_cache.pop(next(iter(_query_vec_cache)))
        _query_vec_cache[key] = vec
    return vec


def embed_texts(texts):
    """Batch document embeddings (one call). None on any failure."""
    if not os.environ.get("GEMINI_API_KEY") or not texts:
        return None
    try:
        return _gemini_embed()(list(texts), task_type="RETRIEVAL_DOCUMENT")
    except Exception as exc:
        print(f"[store] batch embed skipped ({type(exc).__name__})")
        return None


def vector_literal(vec):
    return "[" + ",".join(f"{v:.8f}" for v in vec) + "]"


def _window(hour: int) -> str:
    if hour < 12:
        return "morning"
    if hour < 17:
        return "afternoon"
    return "evening"


def build_input_profile(events, resident_id):
    """Input-profile rules (GAZE_GESTURE_PLAN §4.6) over a list of event
    dicts from the last 14 days. Plain arithmetic, no LLM. Shared by both
    store backends so seed mode and Postgres agree exactly."""
    from statistics import median

    def rate(rows):
        return (sum(1 for r in rows if r["outcome"] == "confirmed") / len(rows)) if rows else 0.0

    by_type = {}
    for e in events:
        by_type.setdefault(e["input_type"], []).append(e)

    rates = {t: round(rate(rows), 2) for t, rows in by_type.items()}

    selects = [e for e in events if e["action"] == "select"]
    select_types = {}
    for e in selects:
        select_types.setdefault(e["input_type"], []).append(e)
    preferred_select = "touch"
    best = -1.0
    for t, rows in select_types.items():
        if len(rows) >= 10 and rate(rows) > best:
            best, preferred_select = rate(rows), t

    approves = [e for e in events if e["action"] == "approve"]
    approve_counts = {}
    for e in approves:
        key = e["gesture"] if (e["input_type"] == "gesture" and e.get("gesture")) else e["input_type"]
        approve_counts[key] = approve_counts.get(key, 0) + 1
    preferred_yes = max(approve_counts, key=approve_counts.get) if approve_counts else "touch"

    gaze_holds = [e["hold_ms"] for e in selects
                  if e["input_type"] == "gaze" and e["outcome"] == "confirmed" and e.get("hold_ms")]
    dwell_ms = int(min(1500, max(600, median(gaze_holds) * 1.1))) if gaze_holds else 1000

    notes = []
    for t, rows in select_types.items():
        overall = rate(rows)
        for window in ("morning", "afternoon", "evening"):
            in_window = [r for r in rows if _window(int(str(r["ts"])[11:13])) == window]
            if len(in_window) >= 8 and (overall - rate(in_window)) >= 0.20:
                notes.append(f"In the {window}, offer touch instead.")

    n = len(events)
    confidence = "high" if n > 50 else ("medium" if n >= 10 else "low")
    return {
        "resident_id": resident_id,
        "preferred_select": preferred_select,
        "preferred_yes": preferred_yes,
        "dwell_ms": dwell_ms,
        "rates": rates,
        "notes": notes,
        "events_counted": n,
        "confidence": confidence,
    }


def source_label(source: str, name: str, date: str | None) -> str:
    """The product's source-label rule, in one place (CLAUDE.md guardrail #2)."""
    if date is not None and not isinstance(date, str):
        date = str(date)
    if source == "resident":
        return f"In {name}'s words"
    if source == "staff":
        return f"Staff observation, {date or 'undated'}"
    if source == "emh":
        return "From EMH"
    if source == "document":
        year = (date or "")[:4]
        return f"From records, {year}" if year else "From records"
    return "Pattern noticed"  # inferred, never shown as fact


def visit_view(v: dict, name: str) -> dict:
    """One My Planner visit block, as the grid and the agents see it."""
    return {
        "id": v["id"], "routine_id": v.get("routine_id"), "staff": v["staff_id"],
        "starts_at": v["starts_at"], "ends_at": v["ends_at"], "source": v["source"],
        "label": source_label(v["source"], name, str(v.get("created_at") or "")[:10]),
        "approved": bool(v["approved"]), "google_synced": bool(v.get("google_event_id")),
    }


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
        accounts = read("users.json")
        self.users = [dict(u, id=i + 1) for i, u in enumerate(accounts["users"])]
        self.assignments = accounts["staff_assignments"]
        # Seed-mode RAG: document vectors cached on disk by content hash
        # (gitignored), so recall is semantic even without the database.
        self._vectors = VectorCache(SEED_DIR / ".embeddings.json", embed_texts)
        # In-memory writes (lost on restart, fine for pre-DB development)
        self.sentences, self.choices, self.observations, self.story_answers = [], [], [], []
        # Action-related writes persist to a shared runtime file so the
        # actions server, backend and mock-booking page (separate processes)
        # see the same bookings before the real database exists.
        # Story answers live in the same file so a browser reload still
        # sees the interview after the profile server restarts.
        runtime_file = os.environ.get("IMW_RUNTIME_FILE", ".runtime.json")
        runtime_path = Path(runtime_file)
        self._runtime_path = runtime_path if runtime_path.is_absolute() else SEED_DIR / runtime_file
        self._runtime = {"action_plans": [], "action_results": [], "bookings": [],
                         "calendar_events": [], "staff_tasks": [], "story_answers": []}
        if self._runtime_path.exists():
            try:
                self._runtime.update(json.loads(self._runtime_path.read_text(encoding="utf-8")))
            except Exception:
                pass

    def _save_runtime(self):
        self._runtime_path.write_text(json.dumps(self._runtime, indent=1), encoding="utf-8")

    def _reload_runtime(self):
        if self._runtime_path.exists():
            try:
                self._runtime = json.loads(self._runtime_path.read_text(encoding="utf-8"))
            except Exception:
                pass

    # ---- reads ----

    def get_resident(self, rid):
        r = self.residents.get(rid)
        if not r:
            self._reload_runtime()
            r = next((x for x in self._runtime.get("residents_added", []) if x["id"] == rid), None)
        if not r:
            return None
        return dict(r, tiles=self._tiles_for(rid))

    # ---- accounts & scope (ROADMAP Phase 2) ----

    def _users_all(self):
        self._reload_runtime()
        return self.users + self._runtime.get("users_added", [])

    def get_user(self, login_id):
        login = (login_id or "").strip().lower()
        return next((dict(u) for u in self._users_all() if u["login_id"].lower() == login), None)

    def list_resident_logins(self):
        return [{"resident_id": u["resident_id"], "display_name": u["display_name"]}
                for u in self._users_all() if u["role"] == "resident" and u.get("resident_id")]

    def get_assignments(self, staff_id):
        self._reload_runtime()
        rows = self.assignments + self._runtime.get("assignments_added", [])
        return sorted({a["resident_id"] for a in rows if a["staff_id"] == staff_id})

    def create_resident(self, payload):
        """Staff create-a-resident: resident row + starter tiles + login +
        assignments, persisted to the shared runtime file."""
        rid = payload["id"]
        if self.get_resident(rid):
            return {"error": f"resident id '{rid}' already exists"}
        if self.get_user(rid):
            return {"error": f"login '{rid}' already exists"}
        self._reload_runtime()
        self._runtime.setdefault("residents_added", []).append(
            {"id": rid, "home_id": payload.get("home_id"), "first_name": payload["first_name"],
             "voice_id": None, "communication_style": payload.get("communication_style") or "",
             "weekly_budget": payload.get("weekly_budget")})
        added = self._runtime.setdefault("tiles_added", [])
        base_id = 2000 + len(added)
        for i, tile in enumerate(payload.get("tiles", [])):
            added.append({"id": base_id + i, "resident_id": rid, "label": tile["label"],
                          "category": tile.get("category"), "cloudinary_id": tile.get("cloudinary_id")})
        self._runtime.setdefault("users_added", []).append(
            {"id": 100 + len(self._runtime.get("users_added", [])), "login_id": rid,
             "role": "resident", "resident_id": rid, "staff_id": None,
             "display_name": payload["first_name"], "secret_hash": payload["secret_hash"]})
        self._runtime.setdefault("assignments_added", []).extend(
            {"staff_id": sid, "resident_id": rid} for sid in payload.get("staff_ids", []))
        self._save_runtime()
        return self.get_resident(rid)

    def _tiles_for(self, rid):
        """Seed tiles plus staff-added photo tiles. Added tiles live in the
        shared runtime file so every server process sees them."""
        self._reload_runtime()
        tiles = [dict(t) for t in self.tiles.get(rid, [])]
        for added in self._runtime.get("tiles_added", []):
            if added["resident_id"] != rid:
                continue
            same = next((t for t in tiles if t["label"].lower() == added["label"].lower()), None)
            if same:
                same.update(cloudinary_id=added["cloudinary_id"],
                            category=added.get("category") or same.get("category"))
            else:
                tiles.append({"id": added["id"], "label": added["label"],
                              "category": added.get("category"),
                              "cloudinary_id": added["cloudinary_id"], "times_used": 0})
        archived = set(self._runtime.get("tiles_archived", []))
        return [t for t in tiles if t["id"] not in archived]

    def set_tile_archived(self, rid, tile_id, archived):
        """Hide or restore a card. Archived cards are never deleted."""
        self._reload_runtime()
        ids = set(self._runtime.get("tiles_archived", []))
        if archived:
            ids.add(tile_id)
        else:
            ids.discard(tile_id)
        self._runtime["tiles_archived"] = sorted(ids)
        self._save_runtime()
        return True

    def save_tile(self, rid, label, category, cloudinary_id):
        """Add a photo tile, or give an existing tile (same label) its new photo.
        Returns (tile, replaced)."""
        existing = next((t for t in self._tiles_for(rid) if t["label"].lower() == label.lower()), None)
        added = self._runtime.setdefault("tiles_added", [])
        added[:] = [a for a in added if not (a["resident_id"] == rid and a["label"].lower() == label.lower())]
        new_id = existing["id"] if existing else 1000 + len(added) + sum(len(v) for v in self.tiles.values())
        added.append({"id": new_id, "resident_id": rid, "label": existing["label"] if existing else label,
                      "category": category or (existing or {}).get("category"),
                      "cloudinary_id": cloudinary_id})
        self._save_runtime()
        tile = next(t for t in self._tiles_for(rid) if t["label"].lower() == label.lower())
        return tile, existing is not None

    def get_story(self, rid):
        return [c for c in self.chapters if c["resident_id"] == rid]

    def get_memories(self, rid, statuses=("confirmed",)):
        return [m for m in self.memories if m["resident_id"] == rid and m["status"] in statuses]

    def _rank(self, rid, rows, texts, query, limit, dates=None, broad=False):
        """Hybrid rank of `rows` (parallel to `texts`) for `query`. See retrieval.select."""
        if not rows:
            return []
        names = _name_words(self.get_resident(rid))
        words = recall_terms(query, ignore=names)
        qvec = embed_text(neutralize(query, names), task_type="RETRIEVAL_QUERY")
        dvecs = self._vectors.vectors(texts) if qvec is not None else [None] * len(texts)
        rec = recency_scores([{"d": d} for d in dates], "d") if dates else [0.0] * len(rows)
        scored = [
            {"row": r, "sim": cosine(qvec, v) if (qvec is not None and v is not None) else None,
             "kw": keyword_hits(t, words), "recency": rc}
            for r, t, v, rc in zip(rows, texts, dvecs, rec)
        ]
        return [dict(x["row"], score=x.get("score"),
                     similarity=round(x["sim"], 3) if x["sim"] is not None else None)
                for x in select(scored, limit, broad)]

    @staticmethod
    def _memory_fact(m):
        return {"content": m["content"], "source": m["source"],
                "date": m.get("source_date") or str(m["last_seen"])[:10],
                "status": m["status"], "kind": "memory",
                "id": m["id"], "update_reason": m.get("update_reason")}

    def search_facts(self, rid, query, limit=8):
        """Coach retrieval (ask_about): memories + staff observations + EMH notes,
        ranked together by the hybrid RAG score."""
        if is_profile_overview_query(query):
            memories = [
                m for m in self.get_memories(rid, ("confirmed", "pending"))
                if m["type"] in ("preference", "routine")
            ]
            return [self._memory_fact(m) for m in memories[:16]]

        facts = [self._memory_fact(m) for m in self.get_memories(rid, ("confirmed", "pending"))]
        facts += [{"content": o["note"], "source": "staff", "date": o["created_at"][:10],
                   "status": "confirmed", "kind": "observation", "id": None, "update_reason": None}
                  for o in self.observations if o["resident_id"] == rid]
        facts += [{"content": n["note"], "source": "emh", "date": n["created_at"][:10],
                   "status": "confirmed", "kind": "emh_note", "id": None, "update_reason": None}
                  for n in self.emh_notes if n["resident_id"] == rid]
        facts += [{"content": f"{d['title']}: {d['body'][:400]}", "source": "document",
                   "date": str(d.get("doc_date") or "")[:10] or None,
                   "status": "confirmed", "kind": "document", "id": None, "update_reason": None}
                  for d in self.get_documents(rid)]
        ranked = self._rank(rid, facts, [f["content"] for f in facts], query, limit,
                            dates=[f["date"] for f in facts])
        for f in ranked:
            f.pop("score", None)  # keep the contract shape
            f.pop("similarity", None)
        return ranked

    # ---- records library (ROADMAP Phase 3) ----

    def add_document(self, rid, title, category, author, doc_date, body):
        self._reload_runtime()
        docs = self._runtime.setdefault("documents", [])
        doc = {"id": len(docs) + 1, "resident_id": rid, "title": title,
               "category": category, "author": author, "doc_date": doc_date,
               "uploaded_at": _now(), "body": body}
        docs.append(doc)
        self._save_runtime()
        return doc

    def get_documents(self, rid):
        self._reload_runtime()
        return sorted(
            [d for d in self._runtime.get("documents", []) if d["resident_id"] == rid],
            key=lambda d: str(d.get("doc_date") or ""), reverse=True)

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
        """One row per question. A second tap replaces the answer instead of adding another."""
        self._reload_runtime()
        answers = self._runtime.setdefault("story_answers", [])
        for row in answers:
            if (row["resident_id"] == rid and row["chapter_key"] == chapter_key
                    and row["question"] == question):
                row["answer"] = answer
                row["created_at"] = _now()
                self._save_runtime()
                return row["id"]
        next_id = max((row.get("id") or 0) for row in answers) + 1 if answers else 1
        row = {"id": next_id, "resident_id": rid, "chapter_key": chapter_key,
               "question": question, "answer": answer, "created_at": _now()}
        answers.append(row)
        self.story_answers.append(row)
        self._save_runtime()
        return row["id"]

    def get_chapter(self, chapter_id):
        for chapter in self.chapters:
            if chapter["id"] == chapter_id:
                return chapter
        return None

    def approve_story_chapter(self, chapter_id, audio_url):
        chapter = self.get_chapter(chapter_id)
        if not chapter:
            return None
        chapter["status"] = "approved"
        chapter["audio_url"] = audio_url
        return chapter

    def get_story_answers(self, rid, chapter_key=None):
        self._reload_runtime()
        rows = [a for a in self._runtime.get("story_answers", []) if a["resident_id"] == rid]
        if chapter_key:
            rows = [a for a in rows if a["chapter_key"] == chapter_key]
        return rows

    # ---- handoff reads (T2.7) ----

    def get_staff(self, staff_id):
        return self.staff.get(staff_id)

    def list_staff(self):
        return [dict(s) for s in self.staff.values()]

    def get_observations(self, rid, since=None):
        rows = [o for o in self.observations if o["resident_id"] == rid]
        if since:
            rows = [o for o in rows if str(o["created_at"]) >= since]
        return rows

    def get_choices(self, rid, since=None):
        rows = [c for c in self.choices if c["resident_id"] == rid]
        if since:
            rows = [c for c in rows if str(c["created_at"]) >= since]
        return rows

    def get_recent_confirmed(self, rid, since=None):
        rows = [m for m in self.memories
                if m["resident_id"] == rid and m["status"] == "confirmed"
                and m["source"] == "resident"]
        if since:
            rows = [m for m in rows if str(m["last_seen"]) >= since]
        return rows

    # ---- memory layer (T2.5) ----

    def remember(self, rid, mem_type, content, source, source_date=None):
        """Save a candidate memory. Near-duplicates (same words, or the same
        fact reworded: cosine >= DUPLICATE_SIM) bump times_seen instead."""
        def merge(m):
            m["times_seen"] += 1
            m["last_seen"] = _now()
            if source_date and not m.get("source_date"):
                m["source_date"] = source_date
            return {"id": m["id"], "merged": True, "times_seen": m["times_seen"], "status": m["status"]}

        same = [m for m in self.memories if m["resident_id"] == rid and m["type"] == mem_type]
        new_words = set(content.lower().split())
        for m in same:
            old_words = set(m["content"].lower().split())
            overlap = len(new_words & old_words) / max(len(new_words | old_words), 1)
            if overlap >= 0.6:
                return merge(m)
        if same:
            new_vec, *old_vecs = self._vectors.vectors([content] + [m["content"] for m in same])
            if new_vec is not None:
                best = max(((cosine(new_vec, v), m) for v, m in zip(old_vecs, same) if v is not None),
                           default=(0.0, None), key=lambda p: p[0])
                if best[0] >= DUPLICATE_SIM:
                    return merge(best[1])
        mem = {"id": max((m["id"] for m in self.memories), default=0) + 1, "resident_id": rid,
               "type": mem_type, "content": content, "source": source, "source_date": source_date,
               "times_seen": 1, "first_seen": _now(), "last_seen": _now(), "status": "pending"}
        self.memories.append(mem)
        return {"id": mem["id"], "merged": False, "times_seen": 1, "status": "pending",
                "source": source, "source_date": source_date}

    def recall(self, rid, query, mem_type=None, limit=6, broad=False):
        """Hybrid RAG: semantic similarity + keyword + recency (retrieval.py).
        Dismissed memories are never candidates."""
        pool = [m for m in self.memories
                if m["resident_id"] == rid and m["status"] in ("confirmed", "pending")
                and (mem_type is None or m["type"] == mem_type)]
        ranked = self._rank(rid, pool, [m["content"] for m in pool], query, limit,
                            dates=[str(m["last_seen"]) for m in pool], broad=broad)
        return [{k: v for k, v in m.items() if k != "score"} for m in ranked]

    def get_pending(self, rid):
        return [m for m in self.memories if m["resident_id"] == rid and m["status"] == "pending"]

    def get_routines(self, rid):
        routines = [m for m in self.memories if m["resident_id"] == rid and m["type"] == "routine"]
        return ([r for r in routines if r["status"] == "confirmed"],
                [r for r in routines if r["status"] == "pending"])

    def _find_memory(self, memory_id):
        return next((m for m in self.memories if m["id"] == memory_id), None)

    def propose_update(self, rid, memory_id, reason):
        m = self._find_memory(memory_id)
        if not m or m["resident_id"] != rid:
            return None
        m["status"] = "pending"
        m["update_reason"] = reason
        m["last_seen"] = _now()
        return m

    def confirm_memory(self, rid, memory_id, confirmed):
        m = self._find_memory(memory_id)
        if not m or m["resident_id"] != rid:
            return None
        if confirmed:
            m["status"] = "confirmed"
            m["source"] = "resident"  # now in the resident's words
        else:
            m["status"] = "dismissed"
        m["last_seen"] = _now()
        return m

    # ---- gaze/gesture input layer (G5) ----

    def log_input_events(self, events):
        if not hasattr(self, "_input_events"):
            self._load_input_events()
        self._input_events.extend(events)
        return len(events)

    def get_input_profile(self, rid):
        if not hasattr(self, "_input_events"):
            self._load_input_events()
        recent = [e for e in self._input_events if e["resident_id"] == rid]
        return build_input_profile(recent, rid)

    def _load_input_events(self):
        path = SEED_DIR / "input_events.json"
        self._input_events = (json.loads(path.read_text(encoding="utf-8"))["input_events"]
                              if path.exists() else [])

    def save_custom_gesture(self, rid, tile_label, samples):
        self._reload_runtime()
        rows = self._runtime.setdefault("custom_gestures", [])
        rows[:] = [g for g in rows if not (g["resident_id"] == rid and g["tile_label"] == tile_label)]
        rows.append({"resident_id": rid, "tile_label": tile_label, "samples": samples})
        self._save_runtime()
        return True

    def get_custom_gestures(self, rid):
        self._reload_runtime()
        return [{"tile_label": g["tile_label"], "samples": g["samples"]}
                for g in self._runtime.get("custom_gestures", []) if g["resident_id"] == rid]

    # ---- actions layer (T2.6) ----

    def create_plan(self, rid, goal, steps, total_cost):
        self._reload_runtime()
        plans = self._runtime["action_plans"]
        plan = {"id": max((p["id"] for p in plans), default=500) + 1, "resident_id": rid,
                "goal": goal, "steps": steps, "total_cost": total_cost,
                "status": "proposed", "created_at": _now()}
        plans.append(plan)
        self._save_runtime()
        return plan

    def get_plan(self, plan_id):
        self._reload_runtime()
        return next((p for p in self._runtime["action_plans"] if p["id"] == plan_id), None)

    def set_plan_status(self, plan_id, status):
        self._reload_runtime()
        plan = next((p for p in self._runtime["action_plans"] if p["id"] == plan_id), None)
        if plan:
            plan["status"] = status
            self._save_runtime()
        return plan

    def log_action_result(self, plan_id, step, result):
        self._reload_runtime()
        self._runtime["action_results"].append(
            {"plan_id": plan_id, "step": step, "result": result, "created_at": _now()})
        self._save_runtime()

    def add_booking(self, rid, activity, starts_at):
        self._reload_runtime()
        self._runtime["bookings"].append(
            {"id": len(self._runtime["bookings"]) + 1, "resident_id": rid,
             "activity": activity, "starts_at": starts_at})
        self._save_runtime()

    def add_calendar_event(self, rid, title, starts_at):
        self._reload_runtime()
        self._runtime["calendar_events"].append(
            {"id": len(self._runtime["calendar_events"]) + 1, "resident_id": rid,
             "title": title, "starts_at": starts_at})
        self._save_runtime()

    def create_staff_task(self, rid, task, due_at, priority="normal"):
        self._reload_runtime()
        row = {"id": len(self._runtime["staff_tasks"]) + 1, "resident_id": rid,
               "task": task, "due_at": due_at, "status": "open",
               "priority": priority, "created_at": _now(),
               "acknowledged_by": None, "acknowledged_at": None}
        self._runtime["staff_tasks"].append(row)
        self._save_runtime()
        return dict(row)

    def get_help_requests(self, rid=None, open_only=True):
        """Urgent 'Get staff help' tasks (ROADMAP Phase 6), newest first."""
        self._reload_runtime()
        rows = [t for t in self._runtime["staff_tasks"]
                if t.get("priority") == "urgent"
                and (rid is None or t["resident_id"] == rid)
                and (not open_only or t["status"] in ("open", "acknowledged"))]
        return sorted(rows, key=lambda t: t.get("created_at") or "", reverse=True)

    def acknowledge_task(self, task_id, staff_id):
        self._reload_runtime()
        row = next((t for t in self._runtime["staff_tasks"] if t["id"] == task_id), None)
        if not row:
            return None
        row["status"] = "acknowledged"
        row["acknowledged_by"] = staff_id
        row["acknowledged_at"] = _now()
        self._save_runtime()
        return dict(row)

    def get_bookings(self):
        self._reload_runtime()
        return list(self._runtime["bookings"])

    def get_staff_tasks(self, rid=None):
        self._reload_runtime()
        tasks = self._runtime["staff_tasks"]
        return [t for t in tasks if rid is None or t["resident_id"] == rid]

    # ---- My Planner: routines, visit events, staff calendar imports ----

    _PLANNER_KEYS = ("routines", "visit_events", "calendar_imports")

    def _fresh(self):
        """Reload the runtime ONCE per call, then work on that dict. (Reloading
        again mid-method swaps the dict and silently drops earlier appends.)"""
        self._reload_runtime()
        for key in self._PLANNER_KEYS:
            self._runtime.setdefault(key, [])
        return self._runtime

    def _rt(self, key):
        return self._fresh()[key]

    def create_routine(self, rid, staff_id, start_time, length_min, days, source, blocks):
        rt = self._fresh()
        routines, visits = rt["routines"], rt["visit_events"]
        routine = {"id": max((r["id"] for r in routines), default=0) + 1, "resident_id": rid,
                   "staff_id": staff_id, "start_time": start_time, "length_min": length_min,
                   "days": days, "source": source, "created_at": _now()}
        routines.append(routine)
        next_id = max((v["id"] for v in visits), default=0) + 1
        made = []
        for i, b in enumerate(blocks):
            made.append({"id": next_id + i, "resident_id": rid, "routine_id": routine["id"],
                         "staff_id": staff_id, "starts_at": b["starts_at"], "ends_at": b["ends_at"],
                         "source": source, "google_event_id": None, "approved": False,
                         "created_at": _now()})
        visits.extend(made)
        self._save_runtime()
        return routine, [dict(v) for v in made]

    def get_routine(self, routine_id):
        return next((dict(r) for r in self._rt("routines") if r["id"] == routine_id), None)

    def get_visits(self, rid=None, routine_id=None):
        return [dict(v) for v in self._rt("visit_events")
                if (rid is None or v["resident_id"] == rid)
                and (routine_id is None or v["routine_id"] == routine_id)]

    def get_visit(self, visit_id):
        return next((dict(v) for v in self._rt("visit_events") if v["id"] == visit_id), None)

    def approve_routine(self, routine_id):
        for v in self._rt("visit_events"):
            if v["routine_id"] == routine_id:
                v["approved"] = True
        self._save_runtime()
        return self.get_visits(routine_id=routine_id)

    def set_visit_google_id(self, visit_id, google_event_id):
        for v in self._rt("visit_events"):
            if v["id"] == visit_id:
                v["google_event_id"] = google_event_id
        self._save_runtime()

    def save_calendar_import(self, import_id, staff_id, events):
        record = {"id": import_id, "staff_id": staff_id, "events": events,
                  "committed": {}, "created_at": _now()}
        self._rt("calendar_imports").append(record)
        self._save_runtime()
        return dict(record)

    def get_calendar_import(self, import_id):
        return next((dict(r) for r in self._rt("calendar_imports") if r["id"] == import_id), None)

    def approve_calendar_import(self, import_id, approved_ids):
        for r in self._rt("calendar_imports"):
            if r["id"] == import_id:
                r["approved"], r["approved_ids"] = True, list(approved_ids)
        self._save_runtime()

    def mark_import_committed(self, import_id, event_id, google_event_id):
        for r in self._rt("calendar_imports"):
            if r["id"] == import_id:
                r["committed"][event_id] = google_event_id
        self._save_runtime()

    def get_activity(self, rid):
        self._reload_runtime()
        items = []
        for s in self.sentences:
            if s["resident_id"] == rid:
                items.append({"kind": "sentence", "date": s["created_at"],
                              "text": f"Spoke: '{s['chosen_text']}'" + ("" if s["approved"] else " (rejected)")})
        for c in self.choices:
            if c["resident_id"] == rid:
                what = c["chosen"] or "not decided yet"
                items.append({"kind": "choice", "date": c["created_at"], "text": f"Choice: {what}"})
        for p in self._runtime["action_plans"]:
            if p["resident_id"] == rid:
                items.append({"kind": "action", "date": p["created_at"],
                              "text": f"Plan '{p['goal']}', {p['status']}"})
        for r in self._runtime["action_results"]:
            plan = next((p for p in self._runtime["action_plans"] if p["id"] == r["plan_id"]), None)
            if plan and plan["resident_id"] == rid:
                items.append({"kind": "action", "date": r["created_at"], "text": r["result"]})
        return sorted(items, key=lambda i: i["date"], reverse=True)


class PostgresStore:
    """Tiger Data backend. Same method signatures/shapes as SeedStore."""

    mode = "postgres"

    def __init__(self, url):
        import psycopg
        from psycopg.rows import dict_row
        self._psycopg = psycopg
        self._dict_row = dict_row
        self.url = url
        # One long-lived connection, reused by every query. Opening a TLS
        # connection to Tiger Data per query cost ~0.25 s each.
        self._db = None
        self._lock = threading.Lock()
        with self._conn() as conn:  # fail fast if unreachable
            conn.execute("SELECT 1")

    @contextmanager
    def _conn(self):
        """Yield the shared connection (reconnecting if it dropped). Commits on
        success, rolls back on error. Serialised: psycopg connections are not
        safe to use from two threads at once."""
        with self._lock:
            if self._db is None or self._db.closed or self._db.broken:
                self._db = self._psycopg.connect(
                    self.url, row_factory=self._dict_row,
                    keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=3)
            try:
                yield self._db
                self._db.commit()
            except Exception:
                try:
                    self._db.rollback()
                except Exception:
                    self._db.close()  # broken; the next call reconnects
                raise

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
            "WHERE resident_id = %s AND NOT archived ORDER BY times_used DESC", (rid,))
        return r

    # ---- accounts & scope (ROADMAP Phase 2) ----

    def get_user(self, login_id):
        return self._one(
            "SELECT id, login_id, role, resident_id, staff_id, display_name, secret_hash "
            "FROM users WHERE lower(login_id) = lower(%s)", ((login_id or "").strip(),))

    def list_resident_logins(self):
        return self._all(
            "SELECT resident_id, display_name FROM users "
            "WHERE role = 'resident' AND resident_id IS NOT NULL ORDER BY display_name")

    def get_assignments(self, staff_id):
        return [r["resident_id"] for r in self._all(
            "SELECT resident_id FROM staff_assignments WHERE staff_id = %s ORDER BY resident_id",
            (staff_id,))]

    def create_resident(self, payload):
        """Staff create-a-resident: resident row + starter tiles + login +
        assignments, in one transaction."""
        rid = payload["id"]
        with self._conn() as conn:
            if conn.execute("SELECT 1 FROM residents WHERE id = %s", (rid,)).fetchone():
                return {"error": f"resident id '{rid}' already exists"}
            if conn.execute("SELECT 1 FROM users WHERE lower(login_id) = lower(%s)", (rid,)).fetchone():
                return {"error": f"login '{rid}' already exists"}
            conn.execute(
                """INSERT INTO residents (id, home_id, first_name, communication_style, weekly_budget)
                   VALUES (%s,%s,%s,%s,%s)""",
                (rid, payload.get("home_id"), payload["first_name"],
                 payload.get("communication_style") or "", payload.get("weekly_budget")))
            for tile in payload.get("tiles", []):
                conn.execute(
                    "INSERT INTO tiles (resident_id, label, category, cloudinary_id) VALUES (%s,%s,%s,%s)",
                    (rid, tile["label"], tile.get("category"), tile.get("cloudinary_id")))
            conn.execute(
                """INSERT INTO users (login_id, role, resident_id, display_name, secret_hash)
                   VALUES (%s,'resident',%s,%s,%s)""",
                (rid, rid, payload["first_name"], payload["secret_hash"]))
            for sid in payload.get("staff_ids", []):
                conn.execute(
                    "INSERT INTO staff_assignments (staff_id, resident_id) VALUES (%s,%s) ON CONFLICT DO NOTHING",
                    (sid, rid))
        return self.get_resident(rid)

    def save_tile(self, rid, label, category, cloudinary_id):
        """Add a photo tile, or give an existing tile (same label) its new photo.
        Returns (tile, replaced)."""
        existing = self._one(
            "SELECT id FROM tiles WHERE resident_id = %s AND lower(label) = lower(%s) ORDER BY id LIMIT 1",
            (rid, label))
        if existing:
            tile = self._one(
                "UPDATE tiles SET cloudinary_id = %s, category = coalesce(%s, category) WHERE id = %s "
                "RETURNING id, label, category, cloudinary_id, times_used",
                (cloudinary_id, category, existing["id"]))
            return tile, True
        tile = self._one(
            "INSERT INTO tiles (resident_id, label, category, cloudinary_id) VALUES (%s,%s,%s,%s) "
            "RETURNING id, label, category, cloudinary_id, times_used",
            (rid, label, category, cloudinary_id))
        return tile, False

    def set_tile_archived(self, rid, tile_id, archived):
        """Hide or restore a card. Archived cards are never deleted."""
        row = self._one(
            "UPDATE tiles SET archived = %s WHERE id = %s AND resident_id = %s RETURNING id",
            (archived, tile_id, rid))
        return row is not None

    def get_story(self, rid):
        return self._all("SELECT * FROM story_chapters WHERE resident_id = %s ORDER BY id", (rid,))

    def get_memories(self, rid, statuses=("confirmed",)):
        return self._all(
            "SELECT * FROM memories WHERE resident_id = %s AND status = ANY(%s) ORDER BY last_seen DESC",
            (rid, list(statuses)))

    def search_facts(self, rid, query, limit=8):
        """Coach retrieval (ask_about). Memories come from the hybrid `recall`;
        staff observations and EMH notes have no embedding column, so they join
        on meaningful keywords only (stopwords dropped)."""
        if is_profile_overview_query(query):
            return self._all(
                """SELECT content, source, coalesce(source_date::text, last_seen::date::text) AS date,
                          status, 'memory' AS kind, id,
                          NULL::text AS update_reason
                   FROM memories
                   WHERE resident_id = %s AND status IN ('confirmed','pending')
                     AND type IN ('preference','routine')
                   ORDER BY id
                   LIMIT %s""",
                (rid, 16))

        facts = [{"content": m["content"], "source": m["source"],
                  "date": str(m.get("source_date") or m["last_seen"])[:10],
                  "status": m["status"], "kind": "memory", "id": m["id"],
                  "update_reason": m.get("update_reason")}
                 for m in self.recall(rid, query, limit=limit)]
        words = recall_terms(query, ignore=_name_words(self.get_resident(rid)))
        room = limit - len(facts)
        if words and room > 0:
            note_match = " OR ".join(["strpos(lower(note), %s) > 0"] * len(words))
            doc_match = " OR ".join(
                ["strpos(lower(title || ' ' || body), %s) > 0"] * len(words))
            facts += self._all(
                f"""SELECT note AS content, 'staff' AS source, created_at::date::text AS date,
                          'confirmed' AS status, 'observation' AS kind, NULL::int AS id,
                          NULL::text AS update_reason
                   FROM observations WHERE resident_id = %s AND ({note_match})
                   UNION ALL
                   SELECT note, 'emh', created_at::date::text, 'confirmed', 'emh_note', NULL::int, NULL::text
                   FROM emh_notes WHERE resident_id = %s AND ({note_match})
                   UNION ALL
                   SELECT title || ': ' || left(body, 400), 'document', doc_date::text,
                          'confirmed', 'document', NULL::int, NULL::text
                   FROM documents WHERE resident_id = %s AND ({doc_match})
                   LIMIT %s""",
                tuple([rid, *words, rid, *words, rid, *words, room]))
        return facts

    # ---- records library (ROADMAP Phase 3) ----

    def add_document(self, rid, title, category, author, doc_date, body):
        doc_id = self._insert(
            "INSERT INTO documents (resident_id, title, category, author, doc_date, body) "
            "VALUES (%s,%s,%s,%s,%s,%s)",
            (rid, title, category, author, doc_date, body))
        return self._one("SELECT * FROM documents WHERE id = %s", (doc_id,))

    def get_documents(self, rid):
        return self._all(
            "SELECT * FROM documents WHERE resident_id = %s "
            "ORDER BY doc_date DESC NULLS LAST, uploaded_at DESC", (rid,))

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
        found = self._one(
            "SELECT id FROM story_answers WHERE resident_id = %s AND chapter_key = %s AND question = %s "
            "ORDER BY id DESC LIMIT 1",
            (rid, chapter_key, question))
        if found:
            with self._conn() as conn:
                conn.execute(
                    "UPDATE story_answers SET answer = %s, created_at = now() WHERE id = %s",
                    (answer, found["id"]))
                conn.commit()
            return found["id"]
        return self._insert(
            "INSERT INTO story_answers (resident_id, chapter_key, question, answer) VALUES (%s,%s,%s,%s)",
            (rid, chapter_key, question, answer))

    def get_chapter(self, chapter_id):
        return self._one("SELECT * FROM story_chapters WHERE id = %s", (chapter_id,))

    def approve_story_chapter(self, chapter_id, audio_url):
        with self._conn() as conn:
            row = conn.execute(
                "UPDATE story_chapters SET status = 'approved', audio_url = %s WHERE id = %s RETURNING *",
                (audio_url, chapter_id)).fetchone()
            conn.commit()
            return dict(row) if row else None

    def get_story_answers(self, rid, chapter_key=None):
        if chapter_key:
            return self._all(
                "SELECT * FROM story_answers WHERE resident_id = %s AND chapter_key = %s ORDER BY id",
                (rid, chapter_key))
        return self._all(
            "SELECT * FROM story_answers WHERE resident_id = %s ORDER BY id",
            (rid,))

    # ---- memory layer (T2.5) ----

    def remember(self, rid, mem_type, content, source, source_date=None):
        # Near-duplicate check, same rule as SeedStore: word overlap first,
        # then meaning (pgvector cosine >= DUPLICATE_SIM, same resident + type).
        new_words = set(content.lower().split())
        vec = embed_text(content, task_type="RETRIEVAL_DOCUMENT")
        same = self._all("SELECT id, content, status, source_date FROM memories WHERE resident_id = %s AND type = %s",
                         (rid, mem_type))
        dup = None
        for m in same:
            old_words = set(m["content"].lower().split())
            if len(new_words & old_words) / max(len(new_words | old_words), 1) >= 0.6:
                dup = m
                break
        if dup is None and vec is not None and same:
            near = self._one(
                "SELECT id, content, status, source_date, 1 - (embedding <=> %s::vector) AS sim "
                "FROM memories WHERE resident_id = %s AND type = %s AND embedding IS NOT NULL "
                "ORDER BY embedding <=> %s::vector LIMIT 1",
                (vector_literal(vec), rid, mem_type, vector_literal(vec)))
            if near and near["sim"] >= DUPLICATE_SIM:
                dup = near
        if dup is not None:
            if source_date and not dup.get("source_date"):
                row = self._one(
                    "UPDATE memories SET times_seen = times_seen + 1, last_seen = now(), "
                    "source_date = %s WHERE id = %s RETURNING id, times_seen, status",
                    (source_date, dup["id"]))
            else:
                row = self._one(
                    "UPDATE memories SET times_seen = times_seen + 1, last_seen = now() "
                    "WHERE id = %s RETURNING id, times_seen, status", (dup["id"],))
            return {"id": row["id"], "merged": True, "times_seen": row["times_seen"], "status": row["status"]}
        if vec is not None:
            new_id = self._insert(
                "INSERT INTO memories (resident_id, type, content, source, source_date, status, embedding) "
                "VALUES (%s,%s,%s,%s,%s,'pending',%s::vector)",
                (rid, mem_type, content, source, source_date, vector_literal(vec)))
        else:
            new_id = self._insert(
                "INSERT INTO memories (resident_id, type, content, source, source_date, status) "
                "VALUES (%s,%s,%s,%s,%s,'pending')",
                (rid, mem_type, content, source, source_date))
        return {"id": new_id, "merged": False, "times_seen": 1, "status": "pending",
                "source": source, "source_date": source_date}

    def recall(self, rid, query, mem_type=None, limit=6, broad=False):
        # Hybrid RAG in one database (the Tiger Data story): pgvector cosine
        # similarity + literal keyword hits are computed in SQL, then the shared
        # retrieval.select applies the calibrated relevance cut. Rows without an
        # embedding yet still qualify on keywords. Same output shape as before.
        names = _name_words(self.get_resident(rid))
        words = recall_terms(query, ignore=names)
        qvec = embed_text(neutralize(query, names), task_type="RETRIEVAL_QUERY")
        if qvec is not None:  # Gemini is reachable: heal any NULL embeddings first
            self._backfill_embeddings(rid)
        type_clause = "AND type = %s" if mem_type else ""
        type_params = [mem_type] if mem_type else []
        kw_sql = (" + ".join(["(strpos(lower(content), %s) > 0)::int"] * len(words))
                  if words else "0")
        if qvec is None and not words:
            return []
        sim_sql = "1 - (embedding <=> %s::vector)" if qvec is not None else "NULL::float"
        sim_params = [vector_literal(qvec)] if qvec is not None else []
        rows = self._all(
            f"""SELECT m.*, {sim_sql} AS sim, ({kw_sql}) AS kw
                FROM memories m
                WHERE resident_id = %s AND status IN ('confirmed','pending') {type_clause}
                ORDER BY coalesce({sim_sql}, 0) + 0.08 * ({kw_sql}) DESC, last_seen DESC
                LIMIT 50""",
            tuple(sim_params + words + [rid] + type_params + sim_params + words))
        if qvec is None:
            for r in rows:
                r["sim"] = None
        rec = recency_scores(rows)
        for r, rc in zip(rows, rec):
            r["recency"] = rc
            r.pop("embedding", None)  # never ship 768 floats to an agent
        picked = select(rows, limit, broad)
        return [{**{k: v for k, v in r.items() if k not in ("sim", "kw", "recency", "score")},
                 "similarity": round(r["sim"], 3) if r.get("sim") is not None else None}
                for r in picked]

    _backfill_failed_at: float | None = None  # None = never failed (see retrieval.VectorCache)

    def _backfill_embeddings(self, rid, batch=32):
        """Self-heal: embed this resident's memories saved while Gemini was down
        (remember inserts them with a NULL embedding). Without this they stay
        keyword-only until someone runs db/reset.py. One batched call; after a
        failure, waits 60s before trying again so a Gemini outage can't slow
        every recall."""
        import time
        last = PostgresStore._backfill_failed_at
        if last is not None and time.monotonic() - last < 60:
            return
        missing = self._all(
            "SELECT id, content FROM memories WHERE resident_id = %s AND embedding IS NULL "
            "ORDER BY id LIMIT %s", (rid, batch))
        if not missing:
            return
        vecs = embed_texts([m["content"] for m in missing])
        if vecs is None or len(vecs) != len(missing):
            PostgresStore._backfill_failed_at = time.monotonic()
            return
        with self._conn() as conn:
            for m, v in zip(missing, vecs):
                conn.execute("UPDATE memories SET embedding = %s::vector WHERE id = %s",
                             (vector_literal(v), m["id"]))
        print(f"[store] backfilled {len(missing)} memory embeddings for {rid}")

    def get_pending(self, rid):
        return self._all(
            "SELECT * FROM memories WHERE resident_id = %s AND status = 'pending' ORDER BY last_seen DESC",
            (rid,))

    def get_routines(self, rid):
        rows = self._all("SELECT * FROM memories WHERE resident_id = %s AND type = 'routine'", (rid,))
        return ([r for r in rows if r["status"] == "confirmed"],
                [r for r in rows if r["status"] == "pending"])

    def propose_update(self, rid, memory_id, reason):
        row = self._one(
            "UPDATE memories SET status = 'pending', last_seen = now() "
            "WHERE id = %s AND resident_id = %s RETURNING *", (memory_id, rid))
        if row:
            row["update_reason"] = reason
        return row

    def confirm_memory(self, rid, memory_id, confirmed):
        if confirmed:
            sql = ("UPDATE memories SET status = 'confirmed', source = 'resident', last_seen = now() "
                   "WHERE id = %s AND resident_id = %s RETURNING *")
        else:
            sql = ("UPDATE memories SET status = 'dismissed', last_seen = now() "
                   "WHERE id = %s AND resident_id = %s RETURNING *")
        return self._one(sql, (memory_id, rid))

    # ---- handoff reads (T2.7) ----

    def get_staff(self, staff_id):
        return self._one("SELECT * FROM staff WHERE id = %s", (staff_id,))

    def list_staff(self):
        return self._all("SELECT id, name, role FROM staff ORDER BY name")

    def get_observations(self, rid, since=None):
        if since:
            return self._all("SELECT * FROM observations WHERE resident_id = %s AND created_at >= %s "
                             "ORDER BY created_at DESC", (rid, since))
        return self._all("SELECT * FROM observations WHERE resident_id = %s ORDER BY created_at DESC", (rid,))

    def get_choices(self, rid, since=None):
        if since:
            return self._all("SELECT * FROM choices WHERE resident_id = %s AND created_at >= %s "
                             "ORDER BY created_at DESC", (rid, since))
        return self._all("SELECT * FROM choices WHERE resident_id = %s ORDER BY created_at DESC", (rid,))

    def get_recent_confirmed(self, rid, since=None):
        sql = ("SELECT * FROM memories WHERE resident_id = %s AND status = 'confirmed' "
               "AND source = 'resident'")
        if since:
            return self._all(sql + " AND last_seen >= %s ORDER BY last_seen DESC", (rid, since))
        return self._all(sql + " ORDER BY last_seen DESC", (rid,))

    # ---- gaze/gesture input layer (G5) ----

    def log_input_events(self, events):
        with self._conn() as conn:
            for e in events:
                conn.execute(
                    """INSERT INTO input_events (ts, resident_id, session_id, input_type, action,
                                                 target, hold_ms, gesture, confidence, outcome)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (e["ts"], e["resident_id"], e.get("session_id"), e["input_type"], e["action"],
                     e.get("target"), e.get("hold_ms"), e.get("gesture"),
                     e.get("confidence"), e["outcome"]))
        return len(events)

    def save_custom_gesture(self, rid, tile_label, samples):
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO custom_gestures (resident_id, tile_label, samples)
                   VALUES (%s, %s, %s)
                   ON CONFLICT (resident_id, tile_label)
                   DO UPDATE SET samples = EXCLUDED.samples, created_at = now()""",
                (rid, tile_label, json.dumps(samples)))
        return True

    def get_custom_gestures(self, rid):
        return [{"tile_label": r["tile_label"], "samples": r["samples"]}
                for r in self._all(
                    "SELECT tile_label, samples FROM custom_gestures WHERE resident_id = %s", (rid,))]

    def get_input_profile(self, rid):
        # Raw 14-day window; the input_daily continuous aggregate serves the
        # same counts pre-bucketed (prize story + dashboards). Raw keeps the
        # profile correct even on plain Postgres or an unrefreshed aggregate.
        rows = self._all(
            "SELECT ts, resident_id, input_type, action, hold_ms, gesture, outcome "
            "FROM input_events WHERE resident_id = %s AND ts >= now() - interval '14 days'",
            (rid,))
        for r in rows:
            r["ts"] = str(r["ts"])
        return build_input_profile(rows, rid)

    # ---- actions layer (T2.6) ----

    def create_plan(self, rid, goal, steps, total_cost):
        plan_id = self._insert(
            "INSERT INTO action_plans (resident_id, goal, steps, total_cost) VALUES (%s,%s,%s,%s)",
            (rid, goal, json.dumps(steps), total_cost))
        return self.get_plan(plan_id)

    def get_plan(self, plan_id):
        return self._one("SELECT * FROM action_plans WHERE id = %s", (plan_id,))

    def set_plan_status(self, plan_id, status):
        return self._one("UPDATE action_plans SET status = %s WHERE id = %s RETURNING *",
                         (status, plan_id))

    def log_action_result(self, plan_id, step, result):
        self._insert("INSERT INTO action_results (plan_id, step, result) VALUES (%s,%s,%s)",
                     (plan_id, step, result))

    def add_booking(self, rid, activity, starts_at):
        self._insert("INSERT INTO bookings (resident_id, activity, starts_at) VALUES (%s,%s,%s)",
                     (rid, activity, starts_at))

    def add_calendar_event(self, rid, title, starts_at):
        self._insert("INSERT INTO calendar_events (resident_id, title, starts_at) VALUES (%s,%s,%s)",
                     (rid, title, starts_at))

    def create_staff_task(self, rid, task, due_at, priority="normal"):
        return self._one(
            "INSERT INTO staff_tasks (resident_id, task, due_at, priority) VALUES (%s,%s,%s,%s) "
            "RETURNING *", (rid, task, due_at, priority))

    def get_help_requests(self, rid=None, open_only=True):
        """Urgent 'Get staff help' tasks (ROADMAP Phase 6), newest first."""
        clauses, params = ["priority = 'urgent'"], []
        if rid is not None:
            clauses.append("resident_id = %s")
            params.append(rid)
        if open_only:
            clauses.append("status IN ('open', 'acknowledged')")
        return self._all(
            f"SELECT * FROM staff_tasks WHERE {' AND '.join(clauses)} ORDER BY created_at DESC",
            tuple(params))

    def acknowledge_task(self, task_id, staff_id):
        return self._one(
            "UPDATE staff_tasks SET status = 'acknowledged', acknowledged_by = %s, "
            "acknowledged_at = now() WHERE id = %s RETURNING *", (staff_id, task_id))

    def get_bookings(self):
        return self._all("SELECT * FROM bookings ORDER BY starts_at")

    def get_staff_tasks(self, rid=None):
        if rid:
            return self._all("SELECT * FROM staff_tasks WHERE resident_id = %s ORDER BY due_at", (rid,))
        return self._all("SELECT * FROM staff_tasks ORDER BY due_at")

    def get_activity(self, rid):
        return self._all(
            """SELECT 'sentence' AS kind, created_at AS date,
                      'Spoke: ''' || coalesce(chosen_text,'') || '''' AS text
               FROM sentences WHERE resident_id = %s
               UNION ALL
               SELECT 'choice', created_at, 'Choice: ' || coalesce(chosen, 'not decided yet')
               FROM choices WHERE resident_id = %s
               UNION ALL
               SELECT 'action', ap.created_at, 'Plan ''' || ap.goal || ''', ' || ap.status
               FROM action_plans ap WHERE ap.resident_id = %s
               UNION ALL
               SELECT 'action', ar.created_at, ar.result
               FROM action_results ar JOIN action_plans ap ON ap.id = ar.plan_id
               WHERE ap.resident_id = %s
               ORDER BY date DESC""",
            (rid, rid, rid, rid))

    # ---- My Planner: routines, visit events, staff calendar imports ----
    # Same shapes as SeedStore: timestamps come back as Toronto ISO strings.

    @staticmethod
    def _visit(row):
        if not row:
            return None
        from calendar_core import DEFAULT_TZ, iso
        from zoneinfo import ZoneInfo
        zone = ZoneInfo(DEFAULT_TZ)
        row = dict(row)
        for key in ("starts_at", "ends_at"):
            if hasattr(row.get(key), "astimezone"):
                row[key] = iso(row[key].astimezone(zone))
        return row

    def create_routine(self, rid, staff_id, start_time, length_min, days, source, blocks):
        with self._conn() as conn:
            routine = conn.execute(
                "INSERT INTO routines (resident_id, staff_id, start_time, length_min, days, source) "
                "VALUES (%s,%s,%s,%s,%s,%s) RETURNING *",
                (rid, staff_id, start_time, length_min, json.dumps(days), source)).fetchone()
            made = [conn.execute(
                "INSERT INTO visit_events (resident_id, routine_id, staff_id, starts_at, ends_at, source) "
                "VALUES (%s,%s,%s,%s,%s,%s) RETURNING *",
                (rid, routine["id"], staff_id, b["starts_at"], b["ends_at"], source)).fetchone()
                for b in blocks]
        return dict(routine), [self._visit(v) for v in made]

    def get_routine(self, routine_id):
        return self._one("SELECT * FROM routines WHERE id = %s", (routine_id,))

    def get_visits(self, rid=None, routine_id=None):
        clauses, params = [], []
        if rid is not None:
            clauses.append("resident_id = %s")
            params.append(rid)
        if routine_id is not None:
            clauses.append("routine_id = %s")
            params.append(routine_id)
        where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = self._all(f"SELECT * FROM visit_events{where} ORDER BY starts_at", tuple(params))
        return [self._visit(r) for r in rows]

    def get_visit(self, visit_id):
        return self._visit(self._one("SELECT * FROM visit_events WHERE id = %s", (visit_id,)))

    def approve_routine(self, routine_id):
        self._all("UPDATE visit_events SET approved = true WHERE routine_id = %s RETURNING id", (routine_id,))
        return self.get_visits(routine_id=routine_id)

    def set_visit_google_id(self, visit_id, google_event_id):
        self._one("UPDATE visit_events SET google_event_id = %s WHERE id = %s RETURNING id",
                  (google_event_id, visit_id))

    def save_calendar_import(self, import_id, staff_id, events):
        return self._one(
            "INSERT INTO calendar_imports (id, staff_id, events) VALUES (%s,%s,%s) RETURNING *",
            (import_id, staff_id, json.dumps(events)))

    def get_calendar_import(self, import_id):
        return self._one("SELECT * FROM calendar_imports WHERE id = %s", (import_id,))

    def approve_calendar_import(self, import_id, approved_ids):
        self._one("UPDATE calendar_imports SET approved = true, approved_ids = %s WHERE id = %s RETURNING id",
                  (json.dumps(list(approved_ids)), import_id))

    def mark_import_committed(self, import_id, event_id, google_event_id):
        self._one(
            "UPDATE calendar_imports SET committed = committed || jsonb_build_object(%s::text, %s::text) "
            "WHERE id = %s RETURNING id", (event_id, google_event_id, import_id))


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

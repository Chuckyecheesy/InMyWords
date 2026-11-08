"""Shared retrieval logic for memory (hybrid RAG): semantic + keyword + recency.

Both stores (SeedStore, PostgresStore) use this so the Coach (`ask_about`),
Voice (`recall`) and Handoff all rank memories the same way.

Plain code only — no LLM here (non-negotiable rule 6). The LLM phrases results
elsewhere; this module only decides WHICH stored facts are relevant.

Calibration (gemini-embedding-001, 768-d, normalized, Marcus seed data, with
the resident's name neutralized in the query): unrelated facts top out around
0.60-0.624 cosine ("pet dog", "favourite colour", "favourite food"), true matches
score 0.635-0.82. So a flat "sim > 0.3" keeps everything. Instead we require an
absolute floor (MIN_SCORE) AND stay near the best hit (MARGIN), and a literal
keyword match lifts a borderline semantic hit. The floor's gap is thin (~0.01):
re-check with api/scripts/rag_probe.py after changing the embedding model or
seed data.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import threading
import time
from pathlib import Path

# Tunable without code changes: `RAG_MIN_SCORE=0.68` etc. in .env.
MIN_SCORE = float(os.environ.get("RAG_MIN_SCORE", "0.63"))   # absolute floor
MARGIN = float(os.environ.get("RAG_MARGIN", "0.08"))         # keep hits within this of the best
KEYWORD_BOOST = float(os.environ.get("RAG_KEYWORD_BOOST", "0.08"))  # per matched word (max 3)

STOPWORDS = frozenset("""
a about after again all also am an and any are as at be been being but by can could did do does doing
for from had has have having he her hers him his how i if in into is it its just me more most my no
nor not of off on once only or other our out over own same she should so some such than that the their
them then there these they this those through to too under until up us very was we were what when where
which while who whom why will with would you your tell know
""".split())


def query_terms(query: str, limit: int = 8, ignore=()) -> list[str]:
    """Meaningful words for literal matching. Letters, digits, - and ' only (a
    tile can't become a regular expression); stopwords dropped so 'what', 'when',
    'he' don't match every sentence. `ignore` drops extra words — pass the
    resident's name, which appears in nearly every fact about them."""
    ignore = {w.lower() for w in ignore if w}
    words: list[str] = []
    for raw in (query or "")[:500].lower().split():
        word = "".join(ch for ch in raw if ch.isalnum() or ch in "-'").strip("-'")
        if (len(word) > 2 and word not in STOPWORDS
                and word not in ignore and word.removesuffix("'s") not in ignore
                and word not in words):
            words.append(word[:40])
        if len(words) == limit:
            break
    return words


def neutralize(query: str, names=()) -> str:
    """Swap the resident's name for 'they' before embedding the query. Their name
    is in most of their facts, so leaving it in inflates similarity for every
    fact that mentions them ('What does Marcus like to drink?' ranked
    'When overwhelmed, Marcus covers his ears' above 'Drinks coffee')."""
    out = query or ""
    for name in {n for n in names if n}:
        out = re.sub(rf"\b{re.escape(name)}'s\b", "their", out, flags=re.IGNORECASE)
        out = re.sub(rf"\b{re.escape(name)}\b", "they", out, flags=re.IGNORECASE)
    return out


def keyword_hits(text: str, words: list[str]) -> int:
    low = (text or "").lower()
    return sum(w in low for w in words)


def cosine(a, b) -> float:
    """Vectors from services.gemini.embed are already L2-normalized, but stay
    safe for hand-built ones."""
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def score(sim: float | None, kw: int) -> float:
    """Semantic similarity, lifted by literal keyword matches. A row with no
    embedding yet (sim None) can still qualify on keywords alone."""
    boost = KEYWORD_BOOST * min(kw, 3)
    if sim is None:
        return MIN_SCORE + boost if kw > 0 else 0.0
    return sim + boost


def select(rows: list[dict], limit: int, broad: bool = False) -> list[dict]:
    """Pick the relevant rows. Each row needs `sim` (cosine or None) and `kw`
    (matched keyword count); optional `recency` (0..1, newer = higher) breaks ties.

    - Embeddings unavailable everywhere -> keyword-only (kw > 0), like before.
    - Otherwise keep rows scoring >= MIN_SCORE and within MARGIN of the best.
    - broad=True drops the MARGIN rule: every on-topic row above the floor.
      For contradiction checks, where a near-duplicate tops the list and the
      memory it contradicts ("Drinks coffee" vs a new tea pattern) sits lower.
    An empty result is meaningful: the Coach must say "I don't know — ask <name>".
    """
    if not rows:
        return []
    scored = []
    for r in rows:
        s = score(r.get("sim"), r.get("kw", 0))
        if s > 0:
            scored.append((s + 0.01 * r.get("recency", 0.0), r))
    if not scored:
        return []
    if all(r.get("sim") is None for r in rows):
        scored.sort(key=lambda p: p[0], reverse=True)
        return [r for _, r in scored[:limit]]
    best = max(s for s, _ in scored)
    kept = [(s, r) for s, r in scored if s >= MIN_SCORE and (broad or s >= best - MARGIN)]
    kept.sort(key=lambda p: p[0], reverse=True)
    return [dict(r, score=round(s, 3)) for s, r in kept[:limit]]


def recency_scores(rows: list[dict], key: str = "last_seen") -> list[float]:
    """1.0 for the newest row down to ~0 for the oldest (rank based)."""
    order = sorted(range(len(rows)), key=lambda i: str(rows[i].get(key) or ""), reverse=True)
    out = [0.0] * len(rows)
    for rank, i in enumerate(order):
        out[i] = 1.0 / (rank + 1)
    return out


class VectorCache:
    """Document-vector cache for the seed (no-database) store.

    Keyed by sha1(text) so edited or new memories re-embed automatically, and
    persisted to disk so a restart doesn't re-spend embedding calls. Failures
    (no key, offline) return None and are not retried for `cooldown` seconds, so
    a down embedding service never slows every recall.
    """

    def __init__(self, path: Path, embed_batch, cooldown: float = 60.0):
        self.path = path
        self.embed_batch = embed_batch  # callable(list[str]) -> list[vec] | None
        self.cooldown = cooldown
        self._lock = threading.Lock()
        self._vecs: dict[str, list[float]] = {}
        self._failed_at = 0.0
        try:
            self._vecs = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass

    @staticmethod
    def _key(text: str) -> str:
        return hashlib.sha1(text.encode("utf-8")).hexdigest()

    def vectors(self, texts: list[str]) -> list[list[float] | None]:
        with self._lock:
            missing = sorted({t for t in texts if t and self._key(t) not in self._vecs})
            if missing and time.monotonic() - self._failed_at > self.cooldown:
                got = self.embed_batch(missing)
                if got is None or len(got) != len(missing):
                    self._failed_at = time.monotonic()
                else:
                    for t, v in zip(missing, got):
                        self._vecs[self._key(t)] = v
                    try:
                        self.path.write_text(json.dumps(self._vecs), encoding="utf-8")
                    except OSError:
                        pass
            return [self._vecs.get(self._key(t)) if t else None for t in texts]

"""Memory RAG audit fixes (offline, no Gemini/DB calls):

1. Reworded duplicates merge (times_seen bump), contradictions never do, and
   the consolidator reports "seen_again" when the server merged.
3. PostgresStore heals NULL embeddings on recall, and backs off after a failure.
4. /suggest only falls back to the seed file when the memory server FAILED,
   not when it returned nothing relevant.
"""

import asyncio
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "mcp"))
os.environ["DATABASE_URL"] = ""
os.environ.setdefault("IMW_RUNTIME_FILE", str(Path(tempfile.mkdtemp()) / "runtime.json"))

import store  # noqa: E402
from retrieval import DUPLICATE_SIM, VectorCache  # noqa: E402
from agents.memory.consolidator import consolidate  # noqa: E402

# Hand-built document vectors with the cosines measured on real Gemini
# embeddings (see retrieval.DUPLICATE_SIM): 0.918 = same fact reworded,
# 0.868 = a contradiction that must stay a separate memory.
BOWLING_OLD = "Bowling on Saturday afternoons, usually 2pm"
BOWLING_NEW = "Goes bowling every Saturday at 2"
COFFEE = "Drinks coffee — a double-double from Tim Hortons"
TEA = "Prefers tea over coffee"


def unit(cos):
    """A 2-d unit vector at the given cosine from [1, 0]."""
    return [cos, (1 - cos * cos) ** 0.5]


FAKE = {BOWLING_OLD: [1.0, 0.0], BOWLING_NEW: unit(0.918),
        COFFEE: [1.0, 0.0], TEA: unit(0.868)}


def fake_cache():
    return VectorCache(Path(tempfile.mkdtemp()) / "v.json",
                       lambda texts: [FAKE.get(t, [0.0, 1.0]) for t in texts])


class DuplicateMergeTests(unittest.TestCase):
    def setUp(self):
        self.s = store.SeedStore()
        self.s._vectors = fake_cache()

    def count(self, text):
        # Marcus only: Dana's seed already has "Prefers tea over coffee".
        return sum(m["content"] == text and m["resident_id"] == "marcus" for m in self.s.memories)

    def test_reworded_duplicate_bumps_times_seen(self):
        before = next(m for m in self.s.memories if m["content"] == BOWLING_OLD)["times_seen"]
        out = self.s.remember("marcus", "routine", BOWLING_NEW, "inferred")
        self.assertTrue(out["merged"])
        self.assertEqual(self.count(BOWLING_NEW), 0)
        self.assertEqual(out["times_seen"], before + 1)

    def test_contradiction_is_never_merged(self):
        self.assertLess(0.868, DUPLICATE_SIM)
        out = self.s.remember("marcus", "preference", TEA, "inferred")
        self.assertFalse(out["merged"])
        self.assertEqual(self.count(TEA), 1)

    def test_no_embeddings_keeps_word_overlap_rule(self):
        self.s._vectors = VectorCache(Path(tempfile.mkdtemp()) / "v.json", lambda t: None)
        out = self.s.remember("marcus", "routine", BOWLING_NEW, "inferred")
        self.assertFalse(out["merged"])  # words differ; no vector to compare


class ConsolidatorSeenAgainTests(unittest.TestCase):
    CANDIDATE = {"type": "routine", "content": BOWLING_NEW, "source": "inferred", "topic": "bowling"}

    def run_it(self, found, remembered):
        calls = []

        def remember(**k):
            calls.append(k)
            return remembered

        out = consolidate(self.CANDIDATE, resident_id="marcus", recall=lambda **k: found,
                          contradicts=lambda c, m: False, remember=remember,
                          propose_update=lambda **k: None)
        return out, calls

    def test_server_merge_reports_seen_again(self):
        out, calls = self.run_it([{"id": 3, "status": "confirmed", "similarity": 0.80}],
                                 {"id": 3, "merged": True, "times_seen": 9})
        self.assertEqual(out, {"action": "seen_again", "memory_id": 3})
        self.assertEqual(len(calls), 1)

    def test_high_similarity_is_seen_again(self):
        out, _ = self.run_it([{"id": 3, "status": "confirmed", "similarity": 0.95}],
                             {"id": 3, "merged": True})
        self.assertEqual(out["action"], "seen_again")

    def test_missing_similarity_does_not_crash(self):
        out, _ = self.run_it([{"id": 3, "status": "confirmed", "similarity": None}],
                             {"id": 30, "merged": False})
        self.assertEqual(out, {"action": "remembered"})


class FakeConn:
    def __init__(self, log):
        self.log = log

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, params):
        self.log.append((sql, params))


class BackfillTests(unittest.TestCase):
    def make(self, missing):
        pg = store.PostgresStore.__new__(store.PostgresStore)  # no real connection
        self.updates = []
        pg._all = lambda sql, params=(): list(missing)
        pg._conn = lambda: FakeConn(self.updates)
        store.PostgresStore._backfill_failed_at = None
        return pg

    def test_null_embeddings_are_filled(self):
        pg = self.make([{"id": 7, "content": "Likes jazz"}, {"id": 8, "content": "Hates rain"}])
        with mock.patch.object(store, "embed_texts", return_value=[[0.1] * 768, [0.2] * 768]):
            pg._backfill_embeddings("marcus")
        self.assertEqual([p[1] for _, p in self.updates], [7, 8])
        self.assertIn("embedding", self.updates[0][0])

    def test_failure_backs_off(self):
        pg = self.make([{"id": 7, "content": "Likes jazz"}])
        with mock.patch.object(store, "embed_texts", return_value=None) as emb:
            pg._backfill_embeddings("marcus")
            pg._backfill_embeddings("marcus")
        self.assertEqual(emb.call_count, 1)  # second call skipped during cooldown
        self.assertEqual(self.updates, [])


class SuggestSeedFallbackTests(unittest.TestCase):
    def post(self, recall):
        from fastapi.testclient import TestClient
        import main as api_main

        async def profile(*a, **k):
            return {"name": "Marcus"}

        with mock.patch.object(api_main.mcp_client, "recall", recall), \
             mock.patch.object(api_main.mcp_client, "get_profile", profile), \
             mock.patch.object(api_main, "load_seed_memories", return_value=[]) as seed:
            r = TestClient(api_main.app).post(
                "/suggest", json={"resident_id": "marcus", "tiles": ["coffee"], "time": "morning"})
        self.assertEqual(r.status_code, 200)
        return seed

    def test_empty_result_does_not_load_seed(self):
        async def empty(*a, **k):
            return {"memories": []}
        self.assertFalse(self.post(empty).called)

    def test_server_failure_loads_seed(self):
        async def down(*a, **k):
            raise ConnectionError("memory server down")
        self.assertTrue(self.post(down).called)


if __name__ == "__main__":
    unittest.main()

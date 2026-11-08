"""Memory RAG selection logic (mcp/retrieval.py). Offline: hand-built vectors,
no Gemini calls. Live calibration is api/scripts/rag_probe.py."""

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "mcp"))

import retrieval  # noqa: E402
from retrieval import (  # noqa: E402
    VectorCache, neutralize, query_terms, select,
)


def row(name, sim, kw=0, recency=0.0):
    return {"name": name, "sim": sim, "kw": kw, "recency": recency}


class QueryTermsTests(unittest.TestCase):
    def test_stopwords_and_name_dropped(self):
        self.assertEqual(
            query_terms("What does Marcus like to drink when he is upset?", ignore=("marcus",)),
            ["like", "drink", "upset"])

    def test_possessive_name_dropped(self):
        self.assertEqual(query_terms("Marcus's favourite drink", ignore=("Marcus",)),
                         ["favourite", "drink"])

    def test_literal_only_and_capped(self):
        self.assertEqual(query_terms("(a+)+ coffee"), ["coffee"])
        self.assertLessEqual(len(query_terms(" ".join(f"word{i}" for i in range(20)))), 8)


class NeutralizeTests(unittest.TestCase):
    def test_name_becomes_pronoun(self):
        self.assertEqual(neutralize("What is Marcus's drink? Ask Marcus", ("marcus",)),
                         "What is their drink? Ask they")

    def test_no_partial_word_replacement(self):
        self.assertEqual(neutralize("Marcusville trip", ("marcus",)), "Marcusville trip")


class SelectTests(unittest.TestCase):
    def test_unrelated_query_returns_nothing(self):
        # The Coach must then say "I don't know — ask <name>".
        rows = [row("music", 0.60), row("bus", 0.61), row("sister", 0.62)]
        self.assertEqual(select(rows, 5), [])

    def test_keeps_only_hits_near_the_best(self):
        rows = [row("coffee", 0.72, kw=1), row("hot drink", 0.70, kw=1),
                row("overwhelmed", 0.64)]
        self.assertEqual([r["name"] for r in select(rows, 5)], ["coffee", "hot drink"])

    def test_keyword_lifts_borderline_semantic_hit(self):
        rows = [row("sister", 0.60, kw=1), row("raptors", 0.62)]
        self.assertEqual([r["name"] for r in select(rows, 5)], ["sister"])

    def test_broad_keeps_everything_above_floor(self):
        rows = [row("tea dup", 0.82, kw=3), row("coffee", 0.66, kw=1), row("bus", 0.60)]
        self.assertEqual([r["name"] for r in select(rows, 5)], ["tea dup"])
        self.assertEqual([r["name"] for r in select(rows, 5, broad=True)], ["tea dup", "coffee"])

    def test_keyword_only_when_no_embeddings(self):
        rows = [row("a", None, kw=0), row("b", None, kw=2), row("c", None, kw=1)]
        self.assertEqual([r["name"] for r in select(rows, 5)], ["b", "c"])

    def test_unembedded_row_still_found_by_keyword(self):
        rows = [row("new memory", None, kw=1), row("old", 0.64)]
        self.assertIn("new memory", [r["name"] for r in select(rows, 5)])

    def test_limit(self):
        rows = [row(str(i), 0.70) for i in range(10)]
        self.assertEqual(len(select(rows, 3)), 3)


class VectorCacheTests(unittest.TestCase):
    def test_embeds_missing_once_and_persists(self):
        calls = []

        def fake(texts):
            calls.append(list(texts))
            return [[float(len(t)), 1.0] for t in texts]

        path = Path(tempfile.mkdtemp()) / "vecs.json"
        cache = VectorCache(path, fake)
        self.assertEqual(cache.vectors(["ab", "abc"]), [[2.0, 1.0], [3.0, 1.0]])
        cache.vectors(["ab", "abc"])
        self.assertEqual(len(calls), 1)
        self.assertEqual(VectorCache(path, fake).vectors(["ab"]), [[2.0, 1.0]])
        self.assertEqual(len(calls), 1)  # served from disk

    def test_failure_returns_none_and_backs_off(self):
        calls = []

        def down(texts):
            calls.append(texts)
            return None

        cache = VectorCache(Path(tempfile.mkdtemp()) / "v.json", down, cooldown=60)
        self.assertEqual(cache.vectors(["x"]), [None])
        cache.vectors(["x"])
        self.assertEqual(len(calls), 1)  # no retry storm while embeddings are down


class SeedStoreOfflineTests(unittest.TestCase):
    """No GEMINI key: recall/search_facts fall back to keyword-only, never crash."""

    def test_keyword_fallback(self):
        import os
        saved = os.environ.pop("GEMINI_API_KEY", None)
        os.environ["DATABASE_URL"] = ""
        try:
            import store
            s = store.SeedStore()
            s._vectors = VectorCache(Path(tempfile.mkdtemp()) / "v.json", lambda t: None)
            facts = s.search_facts("marcus", "Who is Marcus's sister?")
            self.assertTrue(any("Lisa" in f["content"] for f in facts))
            self.assertEqual(set(facts[0]), {"content", "source", "date", "status",
                                             "kind", "id", "update_reason"})
            self.assertEqual(s.search_facts("marcus", "what is he doing"), [])
        finally:
            if saved is not None:
                os.environ["GEMINI_API_KEY"] = saved


if __name__ == "__main__":
    unittest.main()

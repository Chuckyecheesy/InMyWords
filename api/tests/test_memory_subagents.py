"""T4.6 memory subagents. Written before they exist (red).

Observer, Retriever, Consolidator and Routine finder. Model calls and MCP
tools are passed in, so these tests need no network. They lock the rules:
nothing is saved as the resident's words, every memory carries evidence and a
source, a contradiction is only proposed (never overwritten), and routine
math is plain code.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents.memory.consolidator import consolidate  # noqa: E402
from agents.memory.observer import observe  # noqa: E402
from agents.memory.retriever import retrieve  # noqa: E402
from agents.memory.routines import find_routines  # noqa: E402

TEA_NOTE = "Marcus pointed at the tea tin again at breakfast."


class Recorder:
    def __init__(self):
        self.calls = []

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        return {"ok": True}


class ObserverTests(unittest.TestCase):
    def extract(self, facts):
        return lambda prompt: {"candidates": facts}

    def test_staff_observation_is_saved_as_staff_never_resident(self):
        remember = Recorder()
        cand = [{"type": "preference", "content": "Marcus prefers tea",
                 "evidence": TEA_NOTE}]
        observe(TEA_NOTE, kind="observation", resident_id="marcus",
                extract=self.extract(cand), remember=remember)
        self.assertEqual(len(remember.calls), 1)
        self.assertEqual(remember.calls[0]["source"], "staff")
        self.assertNotEqual(remember.calls[0]["source"], "resident")

    def test_sentences_and_choices_are_inferred(self):
        for kind in ("sentence", "choice"):
            remember = Recorder()
            cand = [{"type": "preference", "content": "Marcus likes tea",
                     "evidence": TEA_NOTE}]
            observe(TEA_NOTE, kind=kind, resident_id="marcus",
                    extract=self.extract(cand), remember=remember)
            self.assertEqual(remember.calls[0]["source"], "inferred", kind)

    def test_candidate_without_evidence_from_the_input_is_dropped(self):
        remember = Recorder()
        cand = [{"type": "preference", "content": "Marcus loves jazz",
                 "evidence": "He hums jazz every night"}]
        observe(TEA_NOTE, kind="observation", resident_id="marcus",
                extract=self.extract(cand), remember=remember)
        self.assertEqual(remember.calls, [])

    def test_invalid_type_is_dropped(self):
        remember = Recorder()
        cand = [{"type": "diagnosis", "content": "x", "evidence": TEA_NOTE}]
        observe(TEA_NOTE, kind="observation", resident_id="marcus",
                extract=self.extract(cand), remember=remember)
        self.assertEqual(remember.calls, [])


class RetrieverTests(unittest.TestCase):
    MEMORIES = [
        {"id": 1, "content": "Coffee", "status": "confirmed", "source": "document"},
        {"id": 2, "content": "Tea", "status": "pending", "source": "inferred"},
        {"id": 3, "content": "Juice", "status": "dismissed", "source": "staff"},
    ]

    def test_dismissed_memories_are_never_returned(self):
        got = retrieve("marcus", "drinks", recall=lambda **k: self.MEMORIES)
        self.assertEqual([m["id"] for m in got], [1, 2])

    def test_each_memory_keeps_status_and_source(self):
        got = retrieve("marcus", "drinks", recall=lambda **k: self.MEMORIES)
        for m in got:
            self.assertIn("status", m)
            self.assertIn("source", m)

    def test_limit_is_applied(self):
        got = retrieve("marcus", "drinks", limit=1,
                       recall=lambda **k: self.MEMORIES)
        self.assertEqual(len(got), 1)


class ConsolidatorTests(unittest.TestCase):
    COFFEE = {"id": 7, "content": "Marcus drinks coffee",
              "status": "confirmed", "source": "document"}
    CAND = {"type": "preference", "content": "Marcus picked tea",
            "evidence": "picked tea 5 times", "source": "inferred"}

    def test_contradiction_proposes_update_and_never_overwrites(self):
        remember, propose = Recorder(), Recorder()
        out = consolidate(self.CAND, resident_id="marcus",
                          recall=lambda **k: [self.COFFEE],
                          contradicts=lambda c, m: True,
                          remember=remember, propose_update=propose)
        self.assertEqual(propose.calls[0]["memory_id"], 7)
        self.assertTrue(propose.calls[0]["reason"])
        self.assertEqual(out["action"], "proposed_update")

    def test_similar_memory_is_not_duplicated(self):
        remember, propose = Recorder(), Recorder()
        similar = dict(self.COFFEE, similarity=0.95)
        out = consolidate(self.CAND, resident_id="marcus",
                          recall=lambda **k: [similar],
                          contradicts=lambda c, m: False,
                          remember=remember, propose_update=propose,
                          threshold=0.9)
        self.assertEqual(out["action"], "seen_again")
        self.assertEqual(propose.calls, [])

    def test_at_most_max_checks_model_calls_per_candidate(self):
        confirmed = [{"id": i, "content": f"m{i}", "status": "confirmed"} for i in range(6)]
        asked = []
        consolidate(self.CAND, resident_id="marcus", recall=lambda **k: confirmed,
                    contradicts=lambda c, m: asked.append(m["id"]) or False,
                    remember=Recorder(), propose_update=Recorder(), max_checks=3)
        self.assertEqual(len(asked), 3)

    def test_topic_widens_the_recall_query(self):
        seen = []
        consolidate(dict(self.CAND, topic="drinks"), resident_id="marcus",
                    recall=lambda **k: seen.append(k["query"]) or [],
                    contradicts=lambda c, m: False,
                    remember=Recorder(), propose_update=Recorder())
        self.assertIn("drinks", seen[0])

    def test_new_fact_is_remembered_as_pending_candidate(self):
        remember, propose = Recorder(), Recorder()
        out = consolidate(self.CAND, resident_id="marcus",
                          recall=lambda **k: [],
                          contradicts=lambda c, m: False,
                          remember=remember, propose_update=propose)
        self.assertEqual(out["action"], "remembered")
        self.assertEqual(remember.calls[0]["source"], "inferred")


class RoutineFinderTests(unittest.TestCase):
    # 2026-11-07 is a Saturday.
    def events(self, n, hour=14, content="Bowling"):
        return [{"content": content, "at": f"2026-11-{d:02d}T{hour:02d}:10:00"}
                for d in (7, 14, 21, 28)[:n]]

    def test_pattern_seen_three_times_becomes_suggestion(self):
        got = find_routines(self.events(3), phrase=lambda g: "Bowling Saturdays")
        self.assertEqual(len(got), 1)
        self.assertEqual(got[0]["count"], 3)
        self.assertEqual(got[0]["weekday"], "Saturday")
        self.assertEqual(got[0]["hour"], 14)

    def test_two_sightings_is_not_a_routine(self):
        self.assertEqual(find_routines(self.events(2), phrase=lambda g: "x"), [])

    def test_suggestion_is_pending_inferred_and_labelled(self):
        got = find_routines(self.events(4), phrase=lambda g: "Bowling Saturdays")[0]
        self.assertEqual(got["status"], "pending")
        self.assertEqual(got["source"], "inferred")
        self.assertEqual(got["label"], "pattern noticed")
        self.assertEqual(got["content"], "Bowling Saturdays")

    def test_count_comes_from_code_not_the_phraser(self):
        got = find_routines(self.events(4), phrase=lambda g: "5 times!")[0]
        self.assertEqual(got["count"], 4)


if __name__ == "__main__":
    unittest.main()

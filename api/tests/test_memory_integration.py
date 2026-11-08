"""T4.6 'Done when', against the real memory + profile server tools.

Runs the tool functions in-process on the seed store (no ports, no network).
The model call is a fixed stand-in; everything else is the real code.

  1. The tea pattern appears in Marcus's "confirm?" queue.
  2. The Coach's retrieval labels it "pattern noticed".
  3. The binder's outdated coffee fact is flagged against the tea pattern.
"""

import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "mcp"))
# Empty (not removed) so store._load_env cannot refill it from .env:
# these tests write memories and must never touch a real database.
os.environ["DATABASE_URL"] = ""
os.environ["IMW_RUNTIME_FILE"] = str(Path(tempfile.mkdtemp()) / "runtime.json")

import store as store_module  # noqa: E402
import memory_server  # noqa: E402
import profile_server  # noqa: E402

from agents.memory.consolidator import consolidate  # noqa: E402
from agents.coach_wording import coach_answer  # noqa: E402
from agents.memory.observer import observe  # noqa: E402
from agents.memory.retriever import retrieve  # noqa: E402

EMH_NOTE = "Marcus chose tea at snack time. Third time this week."
TEA_CANDIDATE = {
    "type": "preference",
    "content": "Likes tea now (picked tea again at snack time)",
    "evidence": "Marcus chose tea at snack time",
    "topic": "drinks",
}


def tool(t):
    return getattr(t, "fn", t)


def server_recall(resident_id, query, **_):
    # broad, like wiring.mcp_recall: the consolidator needs every on-topic memory
    out = tool(memory_server.recall)(resident=resident_id, query=query, broad=True)
    return out["memories"]


def server_remember(resident_id, type, content, source, evidence=None, **_):
    return tool(memory_server.remember)(
        resident=resident_id, event=content, source=source, type=type)


def server_propose(resident_id, memory_id, reason):
    return tool(memory_server.propose_update)(
        resident=resident_id, memory=memory_id, reason=reason)


def mentions_coffee_vs_tea(candidate, memory):
    return "coffee" in memory["content"].lower() and "tea" in candidate["content"].lower()


class DoneWhenTests(unittest.TestCase):
    def setUp(self):
        store_module._store = None  # fresh seed store per test
        self.assertEqual(store_module.get_store().mode, "seed")

    def pending(self):
        return tool(memory_server.get_pending)(resident="marcus")["memories"]

    def test_tea_pattern_is_in_the_confirm_queue(self):
        pipeline = observe(
            EMH_NOTE, kind="emh", resident_id="marcus",
            extract=lambda prompt: {"candidates": [TEA_CANDIDATE]},
            remember=lambda **r: consolidate(
                r, resident_id="marcus", recall=server_recall,
                contradicts=mentions_coffee_vs_tea,
                remember=server_remember, propose_update=server_propose),
        )
        self.assertEqual(len(pipeline), 1)
        tea = [m for m in self.pending() if "tea" in m["content"].lower()]
        self.assertTrue(tea, "tea pattern missing from Marcus's confirm queue")
        self.assertEqual(tea[0]["status"], "pending")
        self.assertNotEqual(tea[0]["source"], "resident")

    def test_coach_labels_the_tea_pattern_as_pattern_noticed(self):
        out = tool(profile_server.ask_about)(
            resident="marcus", question="what does he like to drink tea")
        tea = [f for f in out["facts"] if "tea" in f["content"].lower()]
        self.assertTrue(tea, "Coach retrieval did not return the tea pattern")
        self.assertEqual(tea[0]["label"].lower(), "pattern noticed")

    def test_onboarding_question_returns_source_labeled_profile_overview(self):
        out = tool(profile_server.ask_about)(
            resident="marcus", question="Explain Marcus's onboarding")

        self.assertFalse(out["unknown"])
        contents = [fact["content"] for fact in out["facts"]]
        self.assertTrue(any("communicates with single words" in text for text in contents))
        self.assertTrue(any("When overwhelmed" in text for text in contents))
        communication = next(
            fact for fact in out["facts"]
            if "communicates with single words" in fact["content"]
        )
        self.assertEqual(communication["source"], "document")
        self.assertEqual(communication["date"], "2021-03-15")
        self.assertEqual(communication["label"], "From records, 2021")

        answer = coach_answer(out["facts"], "Marcus", "Explain Marcus's onboarding")
        self.assertIn("2021 records", answer)
        self.assertIn("In Marcus's words", answer)
        self.assertIn("pattern", answer.lower())
        self.assertIn("hasn't confirmed", answer)
        self.assertIn("communicates with single words", answer)
        self.assertIn("overwhelmed", answer.lower())

    def test_unrelated_question_still_returns_no_matches(self):
        out = tool(profile_server.ask_about)(
            resident="marcus", question="zzzqqq")
        self.assertTrue(out["unknown"])
        self.assertEqual(out["facts"], [])

    def test_binder_coffee_fact_is_flagged_against_the_tea_pattern(self):
        result = consolidate(
            {**TEA_CANDIDATE, "source": "inferred"}, resident_id="marcus",
            recall=server_recall, contradicts=mentions_coffee_vs_tea,
            remember=server_remember, propose_update=server_propose)
        self.assertEqual(result["action"], "proposed_update")
        coffee = [m for m in self.pending() if "coffee" in m["content"].lower()]
        self.assertTrue(coffee, "binder coffee fact was not flagged")
        self.assertEqual(coffee[0]["source"], "document")
        self.assertTrue(coffee[0]["update_reason"])
        self.assertIn("tea", coffee[0]["update_reason"].lower())

    def test_retriever_returns_tea_and_coffee_with_status(self):
        got = retrieve("marcus", "drinks coffee tea", recall=server_recall)
        text = " ".join(m["content"].lower() for m in got)
        self.assertIn("coffee", text)
        self.assertIn("tea", text)
        for m in got:
            self.assertIn(m["status"], ("confirmed", "pending"))


if __name__ == "__main__":
    unittest.main()

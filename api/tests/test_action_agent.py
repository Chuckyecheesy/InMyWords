"""T4.7 (RED) — Action agent. Tests written first; they fail until
api/agents/action.py exists.

Contract under test: build_plan(goal, memories, phrase=None) -> plan dict
  - steps only from the allowlist, each tagged kind online|staff
  - anything needing physical help becomes create_staff_task
  - usual details (2pm, sister Lisa) come from memories
  - total cost is plain code (sum of step costs); the LLM only phrases
  - nothing is executed here: status is always 'proposed'
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents.action import ALLOWED_STEPS, build_plan  # noqa: E402

MEMORIES = [
    {"type": "routine", "content": "Prefers activities at 2pm.", "source": "resident"},
    {"type": "relationship", "content": "Sister Lisa, lisa@example.com, likes to join outings.",
     "source": "staff"},
]

# goal -> (online step names that must appear, staff tasks required, cost)
GOALS = {
    "bowling Saturday": ({"book_activity", "add_to_calendar", "send_message"}, 1, 15.0),
    "movie night Friday": ({"book_activity", "add_to_calendar"}, 1, 12.0),
    "call my sister Lisa": ({"send_message"}, 0, 0.0),
    "haircut next week": ({"add_to_calendar"}, 1, 0.0),
    "grocery shopping Tuesday": ({"add_to_calendar"}, 1, 0.0),
}


def fake_phrase(text):  # LLM stand-in: must never change numbers
    return text


class ActionPlanTests(unittest.TestCase):
    def plan(self, goal):
        return build_plan(goal, MEMORIES, phrase=fake_phrase)

    def test_five_goals_split_into_online_and_staff(self):
        for goal, (online, n_staff, _cost) in GOALS.items():
            with self.subTest(goal=goal):
                p = self.plan(goal)
                self.assertTrue(online <= {s["step"] for s in p["online_steps"]})
                self.assertEqual(len(p["staff_tasks"]), n_staff)

    def test_only_allowlisted_steps(self):
        for goal in GOALS:
            with self.subTest(goal=goal):
                for s in self.plan(goal)["online_steps"]:
                    self.assertIn(s["step"], ALLOWED_STEPS)
                    self.assertNotEqual(s["step"], "create_staff_task")

    def test_total_cost_is_sum_of_steps_not_llm(self):
        for goal, (_o, _s, cost) in GOALS.items():
            with self.subTest(goal=goal):
                p = self.plan(goal)
                self.assertEqual(p["total_cost"], sum(s["cost"] for s in p["online_steps"]))
                self.assertEqual(p["total_cost"], cost)

    def test_phrasing_cannot_change_cost(self):
        p = build_plan("bowling Saturday", MEMORIES, phrase=lambda t: t + " It costs $999.")
        self.assertEqual(p["total_cost"], 15.0)

    def test_uses_memories_for_usual_details(self):
        p = self.plan("bowling Saturday")
        book = next(s for s in p["online_steps"] if s["step"] == "book_activity")
        self.assertIn("2:00", book["detail"])
        msg = next(s for s in p["online_steps"] if s["step"] == "send_message")
        self.assertEqual(msg["contact"], "lisa")

    def test_usual_time_comes_from_memory(self):
        mem = [{"type": "routine", "content": "Prefers activities at 3pm.", "source": "resident"}]
        p = build_plan("bowling Saturday", mem, phrase=fake_phrase)
        book = next(s for s in p["online_steps"] if s["step"] == "book_activity")
        self.assertIn("3:00pm", book["detail"])

    def test_no_lisa_memory_means_no_message_invented(self):
        p = build_plan("bowling Saturday", [], phrase=fake_phrase)
        self.assertNotIn("send_message", {s["step"] for s in p["online_steps"]})

    def test_phrasing_that_mentions_money_is_discarded(self):
        p = build_plan("bowling Saturday", MEMORIES, phrase=lambda t: "Pay $50 now")
        msg = next(s for s in p["online_steps"] if s["step"] == "send_message")
        self.assertNotIn("$", msg["text"])

    def test_plan_is_only_proposed(self):
        self.assertEqual(self.plan("bowling Saturday")["status"], "proposed")

    def test_unknown_tool_from_model_is_dropped(self):
        def rogue(goal, memories):
            return [{"step": "transfer_money", "kind": "online", "cost": 500}]
        p = build_plan("pay rent", MEMORIES, phrase=fake_phrase, propose=rogue)
        self.assertEqual(p["online_steps"], [])
        self.assertEqual(p["total_cost"], 0)

    def test_llm_failure_still_returns_a_safe_plan(self):
        def boom(goal, memories):
            raise RuntimeError("gemini down")
        p = build_plan("bowling Saturday", MEMORIES, phrase=fake_phrase, propose=boom)
        self.assertEqual(p["status"], "proposed")
        self.assertTrue(p["staff_tasks"])


if __name__ == "__main__":
    unittest.main()

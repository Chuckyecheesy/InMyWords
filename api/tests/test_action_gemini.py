"""Gemini step proposer for the Action agent: the model chooses, code grounds.

No network: `generate` is a fake that returns what a model might say.
"""

import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents.action import build_plan, gemini_propose, ground_steps  # noqa: E402
from services.gemini import EXAMPLES  # noqa: E402

TODAY = date(2026, 11, 8)  # a Sunday
MEMORIES = [
    {"content": "Bowling on Saturday afternoons, usually 2pm", "label": "In Marcus's words"},
    {"content": "Sister Lisa is his main contact", "label": "From records, 2021"},
]


def step(**fields):
    base = {"step": "", "detail": "", "activity": "", "time": "", "title": "",
            "contact": "", "text": "", "task": ""}
    base.update(fields)
    return base


def fake(steps):
    return lambda _prompt: {"steps": steps}


class GroundingTests(unittest.TestCase):
    def test_schema_example_grounds_into_executable_steps(self):
        steps = ground_steps(EXAMPLES["action"]["steps"]["steps"], "bowling Saturday", MEMORIES, TODAY)
        by_step = {s["step"]: s for s in steps}
        self.assertEqual(by_step["book_activity"]["activity"], "Bowling — KW Bowl")
        self.assertEqual(by_step["book_activity"]["time"], "2026-11-14T14:00:00")
        self.assertEqual(by_step["send_message"]["contact"], "lisa")
        self.assertEqual(by_step["create_staff_task"]["kind"], "staff")

    def test_model_cost_is_ignored_and_catalog_price_used(self):
        raw = [step(step="book_activity", activity="bowling", time="2026-11-14T14:00:00"),
               {**step(step="add_to_calendar", title="Bowling"), "cost": 999}]
        plan = build_plan("bowling", MEMORIES, today=TODAY,
                          propose=lambda g, m: ground_steps(raw, g, m, TODAY))
        self.assertEqual(plan["total_cost"], 15.0)
        self.assertEqual(plan["planner"], "gemini")

    def test_invented_venue_and_unknown_contact_are_dropped(self):
        raw = [step(step="book_activity", activity="skydiving"),
               step(step="send_message", contact="stranger@evil.com", text="hi"),
               step(step="add_to_calendar", title="Skydiving")]
        steps = ground_steps(raw, "skydiving", MEMORIES, TODAY)
        self.assertEqual([s["step"] for s in steps], ["add_to_calendar"])

    def test_money_text_is_dropped(self):
        raw = [step(step="send_message", contact="lisa", text="Send me $50"),
               step(step="create_staff_task", task="Go with Marcus")]
        steps = ground_steps(raw, "walk", MEMORIES, TODAY)
        self.assertEqual([s["step"] for s in steps], ["create_staff_task"])

    def test_bad_or_past_time_falls_back_to_usual_time(self):
        raw = [step(step="add_to_calendar", title="Bowling", time="yesterday"),
               step(step="create_staff_task", task="Drive", time="2020-01-01T10:00:00")]
        steps = ground_steps(raw, "bowling Saturday", MEMORIES, TODAY)
        self.assertEqual(steps[0]["time"], "2026-11-14T14:00:00")
        self.assertEqual(steps[1]["time"], "2026-11-14T13:30:00")

    def test_booking_without_staff_task_gets_a_ride(self):
        raw = [step(step="book_activity", activity="movie", time="2026-11-14T19:00:00")]
        steps = ground_steps(raw, "movie Saturday", MEMORIES, TODAY)
        self.assertEqual(steps[-1]["step"], "create_staff_task")
        self.assertIn("Waterloo Cinema", steps[-1]["task"])

    def test_nothing_usable_falls_back_to_rules(self):
        plan = build_plan("bowling Saturday", MEMORIES, today=TODAY,
                          propose=lambda g, m: gemini_propose(g, m, "Marcus", TODAY, generate=fake([])))
        self.assertEqual(plan["planner"], "rules")
        self.assertTrue(plan["staff_tasks"])
        self.assertEqual(plan["total_cost"], 15.0)

    def test_prompt_carries_goal_memories_and_catalog(self):
        seen = {}

        def capture(prompt):
            seen["prompt"] = prompt
            return {"steps": [step(step="add_to_calendar", title="Bowling")]}
        gemini_propose("bowling Saturday", MEMORIES, "Marcus", TODAY, generate=capture)
        for needle in ("bowling Saturday", "usually 2pm", "KW Bowl", "lisa", "Never mention money"):
            self.assertIn(needle, seen["prompt"])


if __name__ == "__main__":
    unittest.main()

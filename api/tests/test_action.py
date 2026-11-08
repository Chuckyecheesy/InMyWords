"""T4.7 Action agent. Memories and outings are passed in, so these tests
need no network. Cost stays in code. Steps stay on the allowlist.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents.action import propose  # noqa: E402

BOWLING = {
    "type": "routine",
    "content": "Bowling on Saturday afternoons, usually 2pm",
    "source": "resident",
    "status": "confirmed",
    "label": "In Marcus's words",
}
LISA = {
    "type": "preference",
    "content": "Sister Lisa is his main contact; weekly phone calls",
    "source": "document",
    "status": "confirmed",
    "label": "From records, 2021",
}
DISMISSED = {
    "type": "routine",
    "content": "Bowling at 11pm and it costs $100",
    "source": "inferred",
    "status": "dismissed",
}
OUTINGS = [
    {"event": "Went bowling", "date": "2026-10-17"},
    {"event": "Went bowling", "date": "2026-10-24"},
    {"event": "Went bowling", "date": "2026-10-31"},
    {"event": "Went bowling, asked to go again", "date": "2026-11-01"},
]


def _plan(goal, *, name="Marcus", memories=None, events=None):
    return propose(goal and "marcus", goal, name=name, memories=memories, events=events)


class ActionAgentTests(unittest.TestCase):
    def test_five_goals_split_online_work_and_staff_help(self):
        goals = [
            ("bowling Saturday", {"book_activity", "add_to_calendar", "send_message"}, 15),
            ("movie night", {"book_activity", "add_to_calendar"}, 12),
            ("see a live Raptors game", {"add_to_calendar"}, 0),
            ("double-double coffee", {"add_to_calendar"}, 0),
            ("herb garden this week", {"book_activity", "add_to_calendar"}, 22),
        ]
        memories = [BOWLING, DISMISSED]
        for goal, online, cost in goals:
            with self.subTest(goal=goal):
                plan = _plan(goal, memories=memories, events=OUTINGS)
                names = {step["step"] for step in plan["online_steps"]}
                self.assertEqual(names, online)
                self.assertTrue(any(step["step"] == "create_staff_task" for step in plan["steps"]))
                self.assertEqual(plan["total_cost"], cost)
                self.assertTrue(all(step["step"] in {
                    "book_activity", "add_to_calendar", "send_message", "create_staff_task",
                } for step in plan["steps"]))

    def test_bowling_showcase_quotes_memory_and_the_saturday_pattern(self):
        plan = _plan("Bowling", memories=[BOWLING, LISA, DISMISSED], events=OUTINGS)
        notes = {agent["id"]: agent["note"] for agent in plan["agents"]}
        self.assertEqual(
            [agent["id"] for agent in plan["agents"]],
            ["observer", "retriever", "routine", "action"],
        )
        self.assertIn("Marcus chose Bowling.", notes["observer"])
        self.assertIn("usually 2pm", notes["retriever"])
        self.assertIn("In Marcus's words", notes["retriever"])
        self.assertNotIn("11pm", notes["retriever"])
        self.assertNotIn("$100", notes["retriever"])
        self.assertIn("Seen 3 times", notes["routine"])
        self.assertIn("Lisa", notes["action"])
        self.assertEqual(plan["total_cost"], 15)
        self.assertEqual(plan["staff_tasks"][0]["task"], "Drive Marcus to KW Bowl")
        self.assertEqual(
            [step["step"] for step in plan["online_steps"]],
            ["book_activity", "add_to_calendar", "send_message"],
        )
        booked = plan["steps"][0]
        self.assertEqual(booked["time"], "2026-11-14T14:00:00")

    def test_a_saved_clock_time_replaces_the_catalog_default(self):
        early = {**BOWLING, "content": "Bowling Saturdays at 11:00am"}
        plan = _plan("bowling Saturday", memories=[early], events=[])
        self.assertEqual(plan["steps"][0]["time"], "2026-11-14T11:00:00")
        self.assertIn("11:00am", plan["steps"][0]["detail"])
        self.assertEqual(plan["total_cost"], 15)

    def test_missing_servers_are_named_and_bowling_still_plans(self):
        plan = _plan("bowling Saturday", memories=None, events=None)
        notes = {agent["id"]: agent["note"] for agent in plan["agents"]}
        self.assertIn("could not reach", notes["retriever"])
        self.assertIn("could not read", notes["routine"])
        self.assertEqual(plan["total_cost"], 15)
        self.assertIn("send_message", [step["step"] for step in plan["steps"]])

    def test_movie_does_not_email_anyone_the_memories_do_not_name(self):
        plan = _plan("movie night", memories=[BOWLING], events=[], name="Dana")
        self.assertNotIn("send_message", [step["step"] for step in plan["steps"]])
        self.assertEqual(plan["total_cost"], 12)
        self.assertIn("Dana", plan["staff_tasks"][0]["task"])


if __name__ == "__main__":
    unittest.main()

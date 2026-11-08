"""Showcase notes on top of the Action agent. Planning rules live in
test_action_agent.py. These tests only check the four notes the choice
screen shows, and that a dismissed memory cannot set the time or the price.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents.action import plan_with_notes  # noqa: E402

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


class ShowcaseTests(unittest.TestCase):
    def test_bowling_notes_quote_memory_and_the_saturday_pattern(self):
        plan = plan_with_notes(
            "Bowling", name="Marcus", memories=[BOWLING, LISA, DISMISSED], events=OUTINGS,
        )
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
        self.assertEqual(plan["status"], "proposed")
        self.assertIn("2:00", plan["online_steps"][0]["detail"])
        self.assertNotIn("11", plan["online_steps"][0]["detail"])

    def test_no_lisa_memory_means_no_message_invented(self):
        plan = plan_with_notes("bowling Saturday", name="Marcus", memories=[BOWLING], events=[])
        self.assertNotIn("send_message", [step["step"] for step in plan["online_steps"]])
        self.assertNotIn("Lisa", {agent["id"]: agent["note"] for agent in plan["agents"]}["action"])

    def test_missing_servers_are_named_and_bowling_still_plans(self):
        plan = plan_with_notes("bowling Saturday", name="Marcus", memories=None, events=None)
        notes = {agent["id"]: agent["note"] for agent in plan["agents"]}
        self.assertIn("could not reach", notes["retriever"])
        self.assertIn("could not read", notes["routine"])
        self.assertEqual(plan["total_cost"], 15)
        self.assertNotIn("send_message", [step["step"] for step in plan["steps"]])


if __name__ == "__main__":
    unittest.main()

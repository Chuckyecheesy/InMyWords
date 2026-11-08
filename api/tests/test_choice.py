"""T3.6: money is code, lines stay neutral, and 'not decided yet' is always there.

No Gemini key required.
"""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents.choice import NOT_DECIDED, build_choice  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
import main as api_main  # noqa: E402

MARCUS = [
    {"label": "Bowling", "photo": "tiles/marcus_bowling", "cost": 15},
    {"label": "Movie", "photo": "tiles/marcus_movie", "cost": 12},
]
DANA = [
    {"label": "Herb garden", "photo": "tiles/dana_herbs", "cost": 22},
    {"label": "Groceries", "photo": "tiles/dana_groceries", "cost": 40},
]


def _by_label(result):
    return {option["label"]: option for option in result["options"]}


class ChoiceMoneyTests(unittest.TestCase):
    def test_marcus_budget_of_40(self):
        result = build_choice(
            resident_id="marcus",
            question="Bowling or a movie this Saturday?",
            options=MARCUS,
            weekly_budget=40,
            generate=None,
        )
        options = _by_label(result)
        self.assertEqual(options["Bowling"]["money_left"], 25)
        self.assertEqual(options["Movie"]["money_left"], 28)
        self.assertIn("$25 left this week.", options["Bowling"]["consequence"])
        self.assertIn("$28 left this week.", options["Movie"]["consequence"])
        self.assertEqual(result["weekly_budget"], 40)

    def test_dana_budget_of_60(self):
        result = build_choice(
            resident_id="dana",
            question="Herb garden or groceries this week?",
            options=DANA,
            weekly_budget=60,
            generate=None,
        )
        options = _by_label(result)
        self.assertEqual(options["Herb garden"]["money_left"], 38)
        self.assertEqual(options["Groceries"]["money_left"], 20)
        self.assertIn("$38 left this week.", options["Herb garden"]["consequence"])
        self.assertIn("$20 left this week.", options["Groceries"]["consequence"])

    def test_over_budget_is_named(self):
        result = build_choice(
            resident_id="marcus",
            question="A big trip?",
            options=[{"label": "Trip", "photo": "tiles/marcus_bus", "cost": 50}],
            weekly_budget=40,
            generate=None,
        )
        trip = _by_label(result)["Trip"]
        self.assertEqual(trip["money_left"], -10)
        self.assertIn("$10 over this week.", trip["consequence"])

    def test_not_decided_is_added_at_cost_zero(self):
        result = build_choice(
            resident_id="marcus",
            question="Saturday?",
            options=MARCUS,
            weekly_budget=40,
            generate=None,
        )
        waiting = _by_label(result)[NOT_DECIDED]
        self.assertEqual(waiting["cost"], 0)
        self.assertEqual(waiting["money_left"], 40)
        self.assertEqual(waiting["photo"], "tiles/marcus_later")
        self.assertEqual(len(result["options"]), 3)


class ChoiceNeutralTests(unittest.TestCase):
    def test_recommendation_and_prices_are_dropped(self):
        def generate(prompt, schema, **kwargs):
            self.assertIn("Bowling", prompt)
            self.assertEqual(schema["required"], ["options"])
            return {
                "options": [
                    {"label": "Bowling", "consequence": "You should choose bowling. It is $15."},
                    {"label": "Movie", "consequence": "A movie is the best plan."},
                    {"label": "not decided yet", "consequence": "Bowling is better. Come back later."},
                ]
            }

        result = build_choice(
            resident_id="marcus",
            question="Saturday?",
            options=MARCUS,
            weekly_budget=40,
            generate=generate,
        )
        options = _by_label(result)
        self.assertTrue(options["Bowling"]["consequence"].startswith("You would choose Bowling."))
        self.assertTrue(options["Movie"]["consequence"].startswith("You would choose Movie."))
        self.assertTrue(options[NOT_DECIDED]["consequence"].startswith("That's okay. We can come back to this."))
        for option in result["options"]:
            phrase = option["consequence"].split(" Costs ")[0]
            self.assertNotRegex(phrase.lower(), r"should|recommend|better|best")
            self.assertNotIn("$", phrase)

    def test_neutral_model_line_is_kept(self):
        def generate(prompt, schema, **kwargs):
            return {
                "options": [
                    {"label": "Bowling", "consequence": "You would go bowling on Saturday."},
                    {"label": "Movie", "consequence": "You would go to a movie."},
                    {"label": "not decided yet", "consequence": "That's okay. We can come back to this."},
                ]
            }

        result = build_choice(
            resident_id="marcus",
            question="Saturday?",
            options=MARCUS,
            weekly_budget=40,
            generate=generate,
        )
        bowling = _by_label(result)["Bowling"]["consequence"]
        self.assertTrue(bowling.startswith("You would go bowling on Saturday."))
        self.assertIn("Costs $15. $25 left this week.", bowling)

    def test_route_records_the_resident_who_tapped(self):
        os.environ["GEMINI_API_KEY"] = ""
        client = TestClient(api_main.app)
        created = client.post("/choices", json={
            "resident_id": "dana",
            "question": "Herb garden or groceries this week?",
            "options": DANA,
        })
        self.assertEqual(created.status_code, 200)
        body = created.json()
        self.assertEqual(body["weekly_budget"], 60)
        self.assertEqual(body["options"][0]["money_left"], 38)
        decided = client.post(f"/choices/{body['id']}/decide", json={"chosen": "Groceries"})
        self.assertEqual(decided.status_code, 200)
        self.assertEqual(decided.json()["status"], "chosen")
        stored = api_main._open_choices[body["id"]]
        self.assertEqual(stored["resident_id"], "dana")

    def test_missing_gemini_key_still_returns_lines(self):
        os.environ["GEMINI_API_KEY"] = ""
        result = build_choice(
            resident_id="dana",
            question="This week?",
            options=DANA,
            weekly_budget=60,
            generate="auto",
        )
        self.assertEqual(len(result["options"]), 3)
        self.assertIn("Herb garden", _by_label(result))


if __name__ == "__main__":
    unittest.main()

"""Coach wording should sound spoken, not like a labelled database report."""

import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents.coach_wording import coach_answer, select_facts  # noqa: E402


def fact(content, label, source="", date=""):
    return {"content": content, "label": label, "source": source, "date": date}


class NaturalCoachWordingTests(unittest.TestCase):
    def test_records_fact_is_spoken_not_a_label_prefix(self):
        out = coach_answer(
            [fact("Drinks coffee — a double-double from Tim Hortons",
                  "From records, 2021", "document", "2021-03-15")],
            "Marcus",
        )
        self.assertIn("From the 2021 records", out)
        self.assertIn("Marcus drinks coffee", out)
        self.assertNotIn("From records, 2021:", out)
        self.assertNotIn(";", out)
        self.assertTrue(out.endswith("."))

    def test_pattern_is_conversational_and_unconfirmed(self):
        out = coach_answer(
            [fact("Likes tea now (picked tea 5 times this week after months of coffee)",
                  "Pattern noticed", "inferred", "2026-11-06")],
            "Marcus",
        )
        self.assertIn("We've noticed a pattern", out)
        self.assertIn("hasn't confirmed", out)
        self.assertIn("picked tea five times", out)
        self.assertNotIn("Pattern noticed:", out)

    def test_staff_date_is_natural_not_iso(self):
        out = coach_answer(
            [fact("Budget session Mondays; groceries Thursdays",
                  "Staff observation, 2026-11-05", "staff", "2026-11-05")],
            "Dana",
        )
        self.assertIn("A staff observation from November 5", out)
        self.assertIn("Dana does her budget on Mondays", out)
        self.assertIn("she gets groceries on Thursdays", out)
        self.assertNotIn("2026-11-05", out)
        self.assertNotIn(";", out)

    def test_times_and_dates_keep_their_digits(self):
        facts = [
            fact("Hot drink with breakfast around 7:30am",
                 "From records, 2021", "document", "2021-03-15"),
            fact("Day program Monday to Friday; pickup is at 8:45",
                 "From records, 2021", "document", "2021-03-15"),
            fact("Repotted the kitchen basil by herself Nov 5, asked for more herbs",
                 "From EMH", "emh", "2026-11-05"),
        ]
        out = coach_answer(facts, "Dana", "")
        self.assertIn("7:30 a.m.", out)
        self.assertIn("8:45", out)
        self.assertIn("November 5", out)
        self.assertNotIn("seven:30", out.lower())
        self.assertNotIn("eight:45", out.lower())
        self.assertNotIn("November five", out)

    def test_names_keep_their_capitals(self):
        out = coach_answer(
            [fact("Sister Lisa is his main contact; weekly phone calls",
                  "From records, 2021", "document", "2021-03-15")],
            "Marcus",
        )
        self.assertIn("sister Lisa", out)
        self.assertNotIn("sister lisa", out)

    def test_semantically_duplicate_facts_are_merged(self):
        facts = [
            fact("Sister visits on Sundays; they have tea together",
                 "In Dana's words", "resident", "2026-11-01"),
            fact("Sister visited Sunday as usual. They had tea on the porch.",
                 "From EMH", "emh", "2026-10-25"),
        ]
        out = coach_answer(facts, "Dana", "When does Dana see her sister?")
        self.assertEqual(out.lower().count("tea"), 1)
        self.assertNotIn("porch", out.lower())
        self.assertIn("Sundays", out)

    def test_repeated_budget_fact_is_not_read_twice(self):
        facts = [
            fact("Budget session Mondays; groceries Thursdays",
                 "Staff observation, 2026-11-05", "staff", "2026-11-05"),
            fact("Budget session: Dana counted out her grocery money herself this week.",
                 "From EMH", "emh", "2026-11-02"),
        ]
        out = coach_answer(facts, "Dana", "What is Dana's budget routine?")
        self.assertEqual(out.lower().count("budget"), 1)
        self.assertNotIn("counted out", out.lower())

    def test_repeated_music_fact_is_not_read_twice(self):
        facts = [
            fact("Listens to music in his room most evenings, using over-ear headphones",
                 "From records, 2021", "document", "2021-03-15"),
            fact("Quiet afternoon. Marcus listened to music in his room after the day program.",
                 "From EMH", "emh", "2026-11-04"),
        ]
        out = coach_answer(facts, "Marcus", "What does Marcus do in the evening?")
        self.assertEqual(out.lower().count("music"), 1)
        self.assertNotIn("afternoon", out.lower())

    def test_selected_facts_are_the_ones_the_answer_uses(self):
        facts = [
            fact("Bowling on Saturday afternoons, usually 2pm",
                 "In Marcus's words", "resident", "2026-11-01"),
            fact("Hot drink with breakfast around 7:30am",
                 "From records, 2021", "document", "2021-03-15"),
            fact("Last-minute changes to Saturday plans upset Marcus",
                 "From records, 2021", "document", "2021-03-15"),
        ]
        chosen = select_facts(facts, "Marcus", "What is Marcus's routine on Saturdays?")
        out = coach_answer(chosen, "Marcus", "What is Marcus's routine on Saturdays?")
        self.assertEqual([row["content"] for row in chosen], [
            "Bowling on Saturday afternoons, usually 2pm",
            "Last-minute changes to Saturday plans upset Marcus",
        ])
        self.assertNotIn("hot drink", out.lower())

    def test_off_topic_facts_are_not_read_aloud(self):
        facts = [
            fact("Bowling on Saturday afternoons, usually 2pm",
                 "In Marcus's words", "resident", "2026-11-01"),
            fact("Hot drink with breakfast around 7:30am",
                 "From records, 2021", "document", "2021-03-15"),
            fact("Day program Monday to Friday; pickup is at 8:45",
                 "From records, 2021", "document", "2021-03-15"),
            fact("Last-minute changes to Saturday plans upset Marcus",
                 "From records, 2021", "document", "2021-03-15"),
            fact("Quiet afternoon. Marcus listened to music in his room after the day program.",
                 "From EMH", "emh", "2026-11-04"),
        ]
        out = coach_answer(facts, "Marcus", "What is Marcus's routine on Saturdays?")
        self.assertIn("bowling on saturday", out.lower())
        self.assertIn("last-minute changes", out.lower())
        self.assertNotIn("hot drink", out.lower())
        self.assertNotIn("day program", out.lower())
        self.assertNotIn("music", out.lower())

    def test_onboarding_answer_is_capped_and_keeps_safety_facts(self):
        facts = [
            fact("Drinks coffee — a double-double from Tim Hortons",
                 "From records, 2021", "document", "2021-03-15"),
            fact("Likes tea now (picked tea 5 times this week after months of coffee)",
                 "Pattern noticed", "inferred", "2026-11-06"),
            fact("Bowling on Saturday afternoons, usually 2pm",
                 "In Marcus's words", "resident", "2026-11-01"),
            fact("Loud rooms are upsetting; quiet spaces and headphones help",
                 "In Marcus's words", "resident", "2026-10-29"),
            fact("Loves the Toronto Raptors; goal is to see a live game",
                 "In Marcus's words", "resident", "2026-11-02"),
            fact("Sister Lisa is his main contact; weekly phone calls",
                 "From records, 2021", "document", "2021-03-15"),
            fact("Hot drink with breakfast around 7:30am",
                 "From records, 2021", "document", "2021-03-15"),
            fact("Marcus communicates with single words, gestures, and picture cards; speak normally, not slowly",
                 "From records, 2021", "document", "2021-03-15"),
            fact("When overwhelmed, Marcus covers his ears and looks for the door; give him space and somewhere quiet",
                 "From records, 2021", "document", "2021-03-15"),
            fact("Day program Monday to Friday; pickup is at 8:45",
                 "From records, 2021", "document", "2021-03-15"),
            fact("Listens to music in his room most evenings, using over-ear headphones",
                 "From records, 2021", "document", "2021-03-15"),
            fact("Being rushed through breakfast is difficult for Marcus",
                 "From records, 2021", "document", "2021-03-15"),
            fact("Last-minute changes to Saturday plans upset Marcus",
                 "From records, 2021", "document", "2021-03-15"),
            fact("Prefers a left-side window seat on bus rides",
                 "From records, 2021", "document", "2021-03-15"),
        ]
        out = coach_answer(facts, "Marcus", "Explain Marcus's onboarding")
        sentences = [s for s in re.split(r"(?<=[.!?])\s+", out) if s]
        self.assertLessEqual(len(sentences), 3)
        self.assertLessEqual(len(out.split()), 90)
        self.assertIn("communicates with single words", out)
        self.assertIn("overwhelmed", out.lower())
        self.assertIn("pattern", out.lower())

    def test_flagged_fact_keeps_warning_but_is_not_dumped_twice(self):
        facts = [
            fact("Likes tea now", "Pattern noticed", "inferred", "2026-11-06"),
            fact("Drinks coffee", "From records, 2021", "document", "2021-03-15",
                 ),
        ]
        facts[1]["update_reason"] = "tea pattern"
        out = coach_answer(facts, "Marcus", "What does Marcus like to drink?")
        self.assertEqual(out.lower().count("drinks coffee"), 1)
        self.assertIn("may be out of date", out.lower())
        self.assertIn("worth asking Marcus", out)
        self.assertLessEqual(out.count(". "), 2)


if __name__ == "__main__":
    unittest.main()

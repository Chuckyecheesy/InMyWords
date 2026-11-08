"""T4.6 wiring: adapters, observer entry point, routine scan, coach wording.
All model and MCP calls are faked."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents.coach_wording import coach_answer  # noqa: E402
from agents.memory import wiring  # noqa: E402
from agents.memory.routines import find_routines  # noqa: E402


class CoachWordingTests(unittest.TestCase):
    def test_pattern_is_labelled_and_not_confirmed(self):
        out = coach_answer([{"content": "Likes tea now", "label": "Pattern noticed"}], "Marcus")
        self.assertTrue(out.startswith("Pattern noticed"))
        self.assertIn("not confirmed by Marcus yet", out)

    def test_records_fact_keeps_its_label(self):
        out = coach_answer([{"content": "Drinks coffee", "label": "From records, 2021"}], "Marcus")
        self.assertTrue(out.startswith("From records, 2021:"))

    def test_flagged_fact_is_called_out_as_possibly_out_of_date(self):
        facts = [{"content": "Likes tea now", "label": "Pattern noticed"},
                 {"content": "Drinks coffee", "label": "From records, 2021",
                  "update_reason": "tea pattern"}]
        self.assertIn("may be out of date: Drinks coffee", coach_answer(facts, "Marcus"))


class ObserveSyncTests(unittest.TestCase):
    def test_note_flows_through_consolidator_to_remember(self):
        saved = []
        cand = {"candidates": [{"type": "preference", "content": "Likes tea",
                                "evidence": "chose tea at snack time", "topic": "drinks"}]}
        wiring.observe_sync(
            "Marcus chose tea at snack time.", "observation", "marcus",
            extract=lambda p: cand, recall=lambda **k: [],
            remember=lambda **r: saved.append(r), propose=lambda **k: None,
            contradicts=lambda c, m: False)
        self.assertEqual(saved[0]["source"], "staff")

    def test_extraction_failure_never_raises_from_observe_event(self):
        import asyncio
        def boom(*a, **k):
            raise RuntimeError("gemini down")
        original = wiring.observe_sync
        wiring.observe_sync = boom
        try:
            asyncio.run(wiring.observe_event("x", "sentence", "marcus"))
        finally:
            wiring.observe_sync = original


class PhrasingPromptTests(unittest.TestCase):
    def test_phrasing_uses_the_easy_model_and_forbids_first_person(self):
        seen = {}

        class Fake:
            @staticmethod
            def generate_for(feature, prompt, schema, **k):
                seen["feature"], seen["prompt"] = feature, prompt
                return {"sentence": "He goes bowling on Saturdays."}

        original = wiring._gemini
        wiring._gemini = lambda: Fake
        try:
            wiring.gemini_phrase({"content": "Went bowling", "weekday": "Saturday", "hour": None})
        finally:
            wiring._gemini = original
        self.assertEqual(seen["feature"], "memory_easy")
        self.assertIn("third person", seen["prompt"])
        self.assertIn("'they'", seen["prompt"])


class ContradictionTypeTests(unittest.TestCase):
    def test_different_types_are_still_compared(self):
        asked = []

        class Fake:
            @staticmethod
            def generate_for(feature, prompt, schema, **k):
                asked.append(prompt)
                return {"contradicts": True}

        original = wiring._gemini
        wiring._gemini = lambda: Fake
        try:
            got = wiring.gemini_contradicts(
                {"type": "routine", "content": "Picks tea at snack time"},
                {"type": "preference", "content": "Drinks coffee"})
        finally:
            wiring._gemini = original
        self.assertTrue(got)
        self.assertEqual(len(asked), 1)


class ContradictionRetryTests(unittest.TestCase):
    def test_a_failed_check_is_retried_once(self):
        calls = []

        class Flaky:
            @staticmethod
            def generate_for(feature, prompt, schema, **k):
                calls.append(1)
                if len(calls) == 1:
                    raise RuntimeError("503")
                return {"contradicts": True}

        original = wiring._gemini
        wiring._gemini = lambda: Flaky
        try:
            got = wiring.gemini_contradicts({"type": "event", "content": "tea"},
                                            {"type": "preference", "content": "coffee"})
        finally:
            wiring._gemini = original
        self.assertTrue(got)
        self.assertEqual(len(calls), 2)

    def test_two_failures_answer_no_flag(self):
        class Down:
            @staticmethod
            def generate_for(*a, **k):
                raise RuntimeError("503")

        original = wiring._gemini
        wiring._gemini = lambda: Down
        try:
            got = wiring.gemini_contradicts({"type": "event", "content": "tea"},
                                            {"type": "preference", "content": "coffee"})
        finally:
            wiring._gemini = original
        self.assertFalse(got)


class ScanRoutinesTests(unittest.TestCase):
    EVENTS = [{"event": "Went bowling", "date": d}
              for d in ("2026-10-17", "2026-10-24", "2026-10-31")]

    def test_three_saturdays_become_a_pending_routine(self):
        saved = []
        out = wiring.scan_routines_sync(
            "marcus", self.EVENTS, phrase=lambda g: "Bowling on Saturdays",
            recall=lambda **k: [], remember=lambda **r: saved.append(r),
            propose=lambda **k: None)
        self.assertEqual(out[0]["count"], 3)
        self.assertEqual(saved[0]["type"], "routine")
        self.assertEqual(saved[0]["source"], "inferred")

    def test_date_only_events_have_no_hour(self):
        got = find_routines([{"content": "x", "at": d} for d in
                             ("2026-10-17", "2026-10-24", "2026-10-31")], phrase=lambda g: "x")
        self.assertIsNone(got[0]["hour"])

    def test_plain_text_fallback_has_no_invented_number(self):
        text = wiring.plain_routine_text({"content": "Went bowling", "weekday": "Saturday", "hour": None})
        self.assertEqual(text, "Went bowling on Saturdays")


if __name__ == "__main__":
    unittest.main()

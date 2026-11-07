"""T4.2 binder import. Written before the importer exists.

The model may propose facts. These tests lock the rules that code must
enforce: only what the document states, the document's own date, source
document, and never resident-confirmed.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents.memory.binder import (  # noqa: E402
    BinderError,
    extraction_prompt,
    import_binder,
    parse_document_date,
)

ROOT = Path(__file__).resolve().parents[2]
BINDER = (ROOT / "db" / "seed" / "marcus_binder.md").read_text(encoding="utf-8")
COFFEE_QUOTE = (
    'his order is a coffee, double cream double sugar ("double-double")'
)


class ParseDocumentDateTests(unittest.TestCase):
    def test_last_full_update_is_the_document_date(self):
        text = (
            "Last full update: March 15, 2021\n"
            "A later note mentions June 2, 2024, which is not the binder date."
        )
        self.assertEqual(parse_document_date(text), "2021-03-15")

    def test_marcus_binder_is_dated_march_15_2021(self):
        self.assertIn(COFFEE_QUOTE, BINDER)
        self.assertEqual(parse_document_date(BINDER), "2021-03-15")

    def test_a_document_without_an_update_line_has_no_date(self):
        self.assertIsNone(parse_document_date("Marcus likes coffee."))


class ExtractionPromptTests(unittest.TestCase):
    def test_prompt_states_the_guardrails_and_includes_the_document(self):
        prompt = extraction_prompt(BINDER, "2021-03-15")
        self.assertIn(BINDER, prompt)
        self.assertIn("Extract only what the document states.", prompt)
        self.assertIn("Never invent a fact, a date, or a quote.", prompt)
        self.assertIn("Keep this document's date on every fact: 2021-03-15.", prompt)
        self.assertIn(
            "Do not mark any fact as the resident's words or as confirmed.",
            prompt,
        )
        self.assertIn("Each fact needs a verbatim quote from the document.", prompt)


class ImportBinderTests(unittest.TestCase):
    def test_undated_document_is_refused_before_the_model_is_called(self):
        called = {"extract": 0, "remember": 0}

        def extract(_prompt):
            called["extract"] += 1
            return []

        def remember(**_kwargs):
            called["remember"] += 1

        with self.assertRaises(BinderError):
            import_binder(
                "No update line.",
                resident_id="marcus",
                extract=extract,
                remember=remember,
            )
        self.assertEqual(called, {"extract": 0, "remember": 0})

    def test_a_response_that_is_not_a_fact_list_is_refused(self):
        def extract(_prompt):
            return "Marcus likes coffee, I think."

        with self.assertRaises(BinderError):
            import_binder(
                BINDER,
                resident_id="marcus",
                extract=extract,
                remember=lambda **_kwargs: None,
            )

    def test_import_keeps_a_quoted_fact_and_drops_an_invention(self):
        saved = []

        def extract(prompt):
            self.assertIn("Extract only what the document states.", prompt)
            self.assertIn("2021-03-15", prompt)
            return {
                "facts": [
                    {
                        "type": "Preference",
                        "content": "Breakfast drink is a coffee double-double",
                        "evidence": COFFEE_QUOTE,
                        "source": "resident",
                        "status": "confirmed",
                        "source_date": "2026-01-01",
                        "resident_id": "dana",
                    },
                    {
                        "type": "preference",
                        "content": "Marcus now drinks only tea",
                        "evidence": "Marcus now drinks only tea every morning",
                    },
                    {
                        "type": "medical",
                        "content": "Takes a morning medication",
                        "evidence": COFFEE_QUOTE,
                    },
                    {
                        "type": "preference",
                        "content": "   ",
                        "evidence": COFFEE_QUOTE,
                    },
                    {
                        "type": "preference",
                        "content": "Likes coffee",
                        "evidence": "coffee",
                    },
                ]
            }

        facts = import_binder(
            BINDER,
            resident_id="marcus",
            extract=extract,
            remember=lambda **kwargs: saved.append(kwargs),
        )

        self.assertEqual(len(facts), 1)
        self.assertEqual(saved, facts)
        fact = facts[0]
        self.assertEqual(fact["resident_id"], "marcus")
        self.assertEqual(fact["type"], "preference")
        self.assertEqual(fact["source"], "document")
        self.assertEqual(fact["status"], "pending")
        self.assertEqual(fact["source_date"], "2021-03-15")
        self.assertEqual(fact["content"], "Breakfast drink is a coffee double-double")
        self.assertEqual(fact["evidence"], COFFEE_QUOTE)
        self.assertNotIn("tea", fact["content"])

    def test_a_quote_still_counts_when_whitespace_differs(self):
        saved = []
        quote = 'his order is a coffee,\n  double cream double sugar ("double-double")'

        def extract(_prompt):
            return [
                {
                    "type": "routine",
                    "content": "Hot drink with breakfast is a coffee double-double",
                    "evidence": quote,
                }
            ]

        import_binder(
            BINDER,
            resident_id="marcus",
            extract=extract,
            remember=lambda **kwargs: saved.append(kwargs),
        )

        self.assertEqual(len(saved), 1)
        self.assertEqual(saved[0]["type"], "routine")
        self.assertEqual(saved[0]["source"], "document")
        self.assertEqual(saved[0]["status"], "pending")

    def test_an_empty_fact_list_saves_nothing(self):
        saved = []

        facts = import_binder(
            BINDER,
            resident_id="marcus",
            extract=lambda _prompt: {"facts": []},
            remember=lambda **kwargs: saved.append(kwargs),
        )

        self.assertEqual(facts, [])
        self.assertEqual(saved, [])


if __name__ == "__main__":
    unittest.main()

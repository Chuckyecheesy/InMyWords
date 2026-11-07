"""T4.2 done-when: binder facts land labelled From records with dates."""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "mcp"))

from agents.memory.binder import import_binder  # noqa: E402
from agents.memory.marcus_extract import marcus_binder_extract  # noqa: E402
from store import SeedStore, source_label  # noqa: E402


class FromRecordsLabelTests(unittest.TestCase):
    def test_document_source_label_includes_year(self):
        self.assertEqual(
            source_label("document", "Marcus", "2021-03-15"),
            "From records, 2021",
        )

    def test_import_lands_document_facts_with_binder_date(self):
        binder = (ROOT / "db" / "seed" / "marcus_binder.md").read_text(encoding="utf-8")
        store = SeedStore()
        before = len(store.memories)

        def remember(**record):
            return store.remember(
                record["resident_id"],
                record["type"],
                record["content"],
                record["source"],
                source_date=record.get("source_date"),
            )

        saved = import_binder(
            binder,
            resident_id="marcus",
            extract=marcus_binder_extract,
            remember=remember,
        )

        self.assertGreaterEqual(len(saved), 4)
        self.assertGreater(len(store.memories), before)
        for fact in saved:
            self.assertEqual(fact["source"], "document")
            self.assertEqual(fact["source_date"], "2021-03-15")
            self.assertEqual(fact["status"], "pending")
            self.assertEqual(
                source_label(fact["source"], "Marcus", fact["source_date"]),
                "From records, 2021",
            )

        coffee = next(m for m in store.memories if "coffee" in m["content"].lower()
                      and m["source"] == "document" and m.get("source_date") == "2021-03-15")
        self.assertEqual(coffee["source_date"], "2021-03-15")

    def test_pending_document_keeps_from_records_not_pattern_noticed(self):
        from memory_server import _fact

        row = {
            "id": 99,
            "type": "preference",
            "content": "Drinks coffee — a double-double from Tim Hortons",
            "source": "document",
            "source_date": "2021-03-15",
            "times_seen": 1,
            "last_seen": "2026-11-07T12:00:00",
            "status": "pending",
        }
        fact = _fact(row, "Marcus")
        self.assertEqual(fact["label"], "From records, 2021")
        self.assertEqual(fact["source"], "document")
        self.assertEqual(fact["date"], "2021-03-15")


if __name__ == "__main__":
    unittest.main()

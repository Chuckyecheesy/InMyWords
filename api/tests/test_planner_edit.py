"""Resident-approved changes to one planner occurrence."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_planner_calendar import PlannerTestCase, actions, profile, tool
import store as store_module


class ResidentVisitChanges(PlannerTestCase):
    def booked(self):
        routine_id = self.dana_routine()["routine_id"]
        result = tool(actions().book_staff_visit)("dana", routine_id, True)
        return routine_id, [visit["id"] for visit in result["visits"]]

    def respond(self, staff, ids, decision):
        return tool(actions().respond_to_visit)(staff, ids, decision)

    def week(self):
        return tool(profile().get_planner)("dana")

    def change(self, visit_id, operation, approved=True, **fields):
        return tool(actions().change_visit)(
            "dana", visit_id, operation, approved, **fields
        )

    def test_requires_approval_and_never_changes_other_occurrences(self):
        _, ids = self.booked()
        before = self.week()["visits"]
        denied = self.change(ids[0], "delete", False)
        self.assertTrue(denied.get("refused"))
        self.assertEqual(self.week()["visits"], before)
        deleted = self.change(ids[0], "delete")
        self.assertNotIn("error", deleted)
        self.assertEqual({v["id"] for v in self.week()["visits"]}, set(ids[1:]))
        self.assertIsNotNone(store_module.get_store().get_visit(ids[0]))

    def test_reschedule_accepted_visit_returns_to_pending_and_removes_google(self):
        _, ids = self.booked()
        self.respond("sam", ids[:1], "accept")
        tool(actions().sync_accepted_visits)("sam", ids[:1])
        deleted = []
        self.gcal.delete = lambda calendar, event: deleted.append((calendar, event))
        out = self.change(
            ids[0], "update", start_date="2026-11-10",
            start_time="10:00", length_min=60,
        )
        self.assertNotIn("error", out)
        visit = next(v for v in self.week()["visits"] if v["id"] == ids[0])
        self.assertEqual(visit["starts_at"], "2026-11-10T10:00:00-05:00")
        self.assertEqual(visit["ends_at"], "2026-11-10T11:00:00-05:00")
        self.assertEqual(visit["status"], "pending")
        self.assertFalse(visit["google_synced"])
        self.assertEqual(len(deleted), 1)
        self.assertEqual(len(self.week()["visits"]), 7)

    def test_unapproved_reschedule_leaves_the_visit_unchanged(self):
        _, ids = self.booked()
        before = self.week()["visits"]
        out = self.change(
            ids[0], "update", False, start_date="2026-11-10",
            start_time="10:00", length_min=60,
        )
        self.assertTrue(out.get("refused"))
        self.assertEqual(self.week()["visits"], before)
        self.assertEqual(self.gcal.inserted, [])

    def test_calendar_failure_preserves_existing_visit(self):
        _, ids = self.booked()
        self.respond("sam", ids[:1], "accept")
        tool(actions().sync_accepted_visits)("sam", ids[:1])
        before = store_module.get_store().get_visit(ids[0])

        def fail(*args):
            raise ConnectionError("offline")

        self.gcal.delete = fail
        out = self.change(ids[0], "delete")
        self.assertIn("error", out)
        self.assertEqual(store_module.get_store().get_visit(ids[0]), before)

    def test_cannot_modify_another_residents_visit(self):
        _, ids = self.booked()
        out = tool(actions().change_visit)("marcus", ids[0], "delete", True)
        self.assertIn("error", out)
        self.assertEqual(len(tool(profile().get_planner)("dana")["visits"]), 7)


if __name__ == "__main__":
    unittest.main()

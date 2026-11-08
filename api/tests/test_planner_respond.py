"""Staff accept or reject a visit the resident booked. RED: written before the code.

Spec: PROJECT_PLAN §2.5 "Staff accept or reject", CONTRACTS POST /planner/respond,
BUILD_PLAN visit_events.status. Offline: seed store in a temp runtime file and
a fake Google Calendar (see test_planner_calendar.py).

  - A visit the resident approved is a request: status "pending", on both
    calendars, and NOT on Google yet.
  - Only the staff member named on the visit can answer.
  - accept -> "accepted": shows on both ends, then goes onto staff's Google
    Calendar (Gemini subagent first, plain code finishes the rest).
  - reject -> "rejected": gone from both calendars, never on Google, row kept
    for the log, and the resident is told it was declined.
"""

import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "mcp"))

from tests.test_planner_calendar import DownCalendar, PlannerTestCase, actions, profile, tool  # noqa: E402
import store as store_module  # noqa: E402


def call_tool(name, args):
    import actions_server
    import profile_server
    fn = getattr(actions_server, name, None) or getattr(profile_server, name)
    return tool(fn)(**args)


class RespondCase(PlannerTestCase):
    def booked(self, **routine):
        """Dana approves a routine with Sam; returns the visit ids."""
        rid = self.dana_routine(**routine)["routine_id"]
        out = tool(actions().book_staff_visit)("dana", rid, True)
        return rid, [v["id"] for v in out["visits"]]

    def respond(self, staff, ids, decision):
        return tool(actions().respond_to_visit)(staff, ids, decision)

    def week(self):
        return tool(profile().get_planner)("dana")


class BookingIsARequest(RespondCase):
    def test_approved_visit_waits_for_staff(self):
        _, ids = self.booked()
        visits = self.week()["visits"]
        self.assertEqual(len(visits), 7)
        self.assertTrue(all(v["status"] == "pending" for v in visits))
        self.assertTrue(all(v["approved"] for v in visits), "the resident's approval still counts")

    def test_nothing_reaches_google_until_staff_accept(self):
        _, out_ids = self.booked()
        self.assertEqual(self.gcal.inserted, [])

    def test_gated_write_refuses_a_pending_visit(self):
        _, ids = self.booked()
        v = self.week()["visits"][0]
        out = tool(actions().write_calendar_event)("dana", v["id"], v["starts_at"], v["ends_at"])
        self.assertTrue(out.get("refused"))
        self.assertEqual(self.gcal.inserted, [])


class Accept(RespondCase):
    def test_accept_marks_accepted_on_both_ends(self):
        _, ids = self.booked()
        out = self.respond("sam", ids, "accept")
        self.assertNotIn("error", out)
        self.assertTrue(all(v["status"] == "accepted" for v in out["visits"]))
        self.assertTrue(all(v["status"] == "accepted" for v in self.week()["visits"]))

    def test_accept_then_sync_puts_it_on_staff_google(self):
        _, ids = self.booked()
        self.respond("sam", ids, "accept")
        out = tool(actions().sync_accepted_visits)("sam", ids)
        self.assertEqual(len(self.gcal.inserted), 7)
        self.assertTrue(out["google_synced"])
        self.assertIn("approved by Dana", self.gcal.inserted[0][1]["description"])

    def test_sync_never_writes_a_pending_visit(self):
        _, ids = self.booked()
        out = tool(actions().sync_accepted_visits)("sam", ids)
        self.assertEqual(self.gcal.inserted, [])
        self.assertFalse(out["google_synced"])

    def test_accept_some_days_only(self):
        _, ids = self.booked()
        self.respond("sam", ids[:2], "accept")
        statuses = sorted(v["status"] for v in self.week()["visits"])
        self.assertEqual(statuses.count("accepted"), 2)
        self.assertEqual(statuses.count("pending"), 5)

    def test_accept_is_logged(self):
        _, ids = self.booked()
        self.respond("sam", ids, "accept")
        log = store_module.get_store()._runtime.get("action_results", [])
        self.assertTrue(any(r.get("step") == "respond_to_visit" and "accept" in r.get("result", "") for r in log))

    def test_records_who_answered(self):
        _, ids = self.booked()
        self.respond("sam", ids[:1], "accept")
        row = store_module.get_store().get_visit(ids[0])
        self.assertEqual(row["responded_by"], "sam")
        self.assertTrue(row["responded_at"])


class Reject(RespondCase):
    def test_reject_disappears_from_both_calendars(self):
        _, ids = self.booked()
        out = self.respond("sam", ids[:1], "reject")
        self.assertNotIn("error", out)
        visits = self.week()["visits"]
        self.assertEqual(len(visits), 6)
        self.assertNotIn(ids[0], [v["id"] for v in visits])
        self.assertTrue(all(v["status"] != "rejected" for v in visits))

    def test_reject_never_reaches_google(self):
        _, ids = self.booked()
        self.respond("sam", ids, "reject")
        tool(actions().sync_accepted_visits)("sam", ids)
        self.assertEqual(self.gcal.inserted, [])

    def test_row_is_kept_for_the_log(self):
        _, ids = self.booked()
        self.respond("sam", ids[:1], "reject")
        row = store_module.get_store().get_visit(ids[0])
        self.assertEqual(row["status"], "rejected")
        log = store_module.get_store()._runtime.get("action_results", [])
        self.assertTrue(any(r.get("step") == "respond_to_visit" and "reject" in r.get("result", "") for r in log))

    def test_resident_is_told_about_upcoming_declined_visits(self):
        _, ids = self.booked(start_date="2030-01-07")
        self.respond("sam", ids[:1], "reject")
        declined = self.week()["declined"]
        self.assertEqual([d["id"] for d in declined], ids[:1])
        self.assertEqual(declined[0]["staff"], "sam")
        self.assertEqual(declined[0]["status"], "rejected")

    def test_past_declined_visits_are_not_repeated(self):
        _, ids = self.booked(start_date="2020-01-06")
        self.respond("sam", ids[:1], "reject")
        self.assertEqual(self.week()["declined"], [])


class OnlyTheNamedStaff(RespondCase):
    def test_other_staff_cannot_answer(self):
        _, ids = self.booked()
        out = self.respond("jordan", ids, "accept")
        self.assertTrue(out.get("refused"))
        self.assertTrue(all(v["status"] == "pending" for v in self.week()["visits"]))

    def test_cannot_answer_twice(self):
        _, ids = self.booked()
        self.respond("sam", ids[:1], "accept")
        out = self.respond("sam", ids[:1], "reject")
        self.assertIn("error", out)
        self.assertEqual(store_module.get_store().get_visit(ids[0])["status"], "accepted")

    def test_cannot_answer_before_the_resident_approves(self):
        ids = [v["id"] for v in self.dana_routine()["visits"]]
        out = self.respond("sam", ids, "accept")
        self.assertIn("error", out)

    def test_unknown_decision_or_visit_is_an_error(self):
        _, ids = self.booked()
        self.assertIn("error", self.respond("sam", ids, "maybe"))
        self.assertIn("error", self.respond("sam", [99999], "accept"))
        self.assertIn("error", self.respond("sam", [], "accept"))
        self.assertTrue(all(v["status"] == "pending" for v in self.week()["visits"]),
                        "a bad batch changes nothing")


class PlannerAgentOnAccept(RespondCase):
    """api/agents/planner.respond_visits: Gemini writes accepted visits, rules finish."""

    def test_book_visits_writes_nothing_to_google(self):
        from agents import planner
        rid = self.dana_routine()["routine_id"]
        out = planner.book_visits("dana", rid, True, call_tool=call_tool, run_tools=None)
        self.assertEqual(self.gcal.inserted, [])
        self.assertFalse(out["google_synced"])
        self.assertTrue(all(v["status"] == "pending" for v in out["visits"]))

    def test_accept_with_gemini_off_uses_rules(self):
        from agents import planner
        _, ids = self.booked()
        out = planner.respond_visits("sam", ids, "accept", call_tool=call_tool, run_tools=None)
        self.assertEqual(out["planner"], "rules")
        self.assertEqual(len(self.gcal.inserted), 7)
        self.assertTrue(out["google_synced"])

    def test_reject_never_runs_gemini(self):
        from agents import planner
        _, ids = self.booked()
        ran = []
        out = planner.respond_visits("sam", ids, "reject", call_tool=call_tool,
                                     run_tools=lambda *a, **k: ran.append(1))
        self.assertEqual(ran, [])
        self.assertEqual(self.gcal.inserted, [])
        self.assertTrue(all(v["status"] == "rejected" for v in out["visits"]))

    def test_refusal_passes_through(self):
        from agents import planner
        _, ids = self.booked()
        out = planner.respond_visits("jordan", ids, "accept", call_tool=call_tool, run_tools=None)
        self.assertTrue(out.get("refused"))
        self.assertEqual(self.gcal.inserted, [])

    def test_calendar_down_still_accepts_in_the_app(self):
        from agents import planner
        tool(actions().set_calendar_client)(DownCalendar())
        _, ids = self.booked()
        out = planner.respond_visits("sam", ids, "accept", call_tool=call_tool, run_tools=None)
        self.assertFalse(out["google_synced"])
        self.assertTrue(all(v["status"] == "accepted" for v in self.week()["visits"]))


class RespondRoute(RespondCase):
    """POST /planner/respond (CONTRACTS.md), MCP replaced by in-process tools."""

    def test_mcp_client_knows_the_new_tools(self):
        from services import mcp_client
        self.assertEqual(mcp_client.PLANNER_TOOLS["respond_to_visit"], "actions")
        self.assertEqual(mcp_client.PLANNER_TOOLS["sync_accepted_visits"], "actions")

    def test_route_accepts_and_rejects(self):
        from unittest import mock
        from fastapi.testclient import TestClient
        import main
        _, ids = self.booked()
        with mock.patch.object(main, "_sync_call_tool", lambda: call_tool), \
                mock.patch("agents.planner.default_run_tools", lambda: None):
            client = TestClient(main.app)
            ok = client.post("/planner/respond", json={"staff_id": "sam", "visit_ids": ids[:1],
                                                      "decision": "accept"}).json()
            no = client.post("/planner/respond", json={"staff_id": "sam", "visit_ids": ids[1:2],
                                                      "decision": "reject"}).json()
            refused = client.post("/planner/respond", json={"staff_id": "jordan", "visit_ids": ids[2:3],
                                                           "decision": "accept"}).json()
        self.assertEqual(ok["visits"][0]["status"], "accepted")
        self.assertEqual(len(ok["google_event_ids"]), 1)
        self.assertEqual(no["visits"][0]["status"], "rejected")
        self.assertTrue(refused.get("refused"))


if __name__ == "__main__":
    unittest.main()

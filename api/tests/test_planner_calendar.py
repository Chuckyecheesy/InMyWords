"""My Planner -> calendar, plus both .zip paths. RED: written before the code.

Spec: PROJECT_PLAN §2.5, BUILD_PLAN T2.6, CONTRACTS /planner/*.
Offline: seed store in a temp runtime file, and a fake Google Calendar
client injected with actions_server.set_calendar_client(). No network.

What has to exist for these to go green:

  mcp/calendar_core.py   (plain code, never the LLM; rule 6)
    expand_routine(start_date, start_time, length_min, days=None,
                   tz="America/Toronto") -> [{"starts_at", "ends_at"}]
    parse_calendar_zip(data: bytes, tz="America/Toronto")
        -> [{"title", "starts_at", "ends_at", "recurrence", "source_file"}]
        or raises ValueError for a file that is not a zip

  mcp/profile_server.py
    save_routine(resident, staff, start_time, length_min, days=None,
                 start_date=None) -> {"routine_id", "visits": [...]}
    get_planner(resident) -> {"visits": [...]}

  mcp/actions_server.py
    set_calendar_client(client | None)
    book_staff_visit(resident, routine_id, approved) -> {...}
    import_calendar(resident, calendar_zip_b64)          # MCP-down fallback
    propose_calendar_import(staff, calendar_zip_b64)     # staff import, stretch
    commit_calendar_import(staff, import_id, approved_ids, approved)

A calendar client is any object with
    insert(calendar_id, event) -> google_event_id
    list(calendar_id, time_min, time_max) -> [event]
where an event is Google's shape:
    {"summary", "description", "start": {"dateTime", "timeZone"},
     "end": {"dateTime", "timeZone"}, "recurrence"?: [...]}
"""

import base64
import io
import os
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "mcp"))
# Empty (not removed) so store._load_env cannot refill it from .env.
os.environ["DATABASE_URL"] = ""
os.environ["IMW_RUNTIME_FILE"] = str(Path(tempfile.mkdtemp()) / "runtime.json")
# Never let a test reach the real Google Calendar, even if a key is on disk.
os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"] = ""

import store as store_module  # noqa: E402

TZ = "America/Toronto"


def tool(t):
    """FastMCP wraps tools; reach the plain function."""
    return getattr(t, "fn", t)


# Imported lazily so each test reports its own failure while the code is missing.
def core():
    import calendar_core
    return calendar_core


def profile():
    import profile_server
    return profile_server


def actions():
    import actions_server
    return actions_server


# ---- fakes -----------------------------------------------------------------

class FakeCalendar:
    """Records every write. `existing` is what list() returns."""

    def __init__(self, existing=None):
        self.inserted = []          # [(calendar_id, event)]
        self.existing = existing or []

    def insert(self, calendar_id, event):
        self.inserted.append((calendar_id, event))
        return f"g{len(self.inserted)}"

    def list(self, calendar_id, time_min, time_max):
        return list(self.existing)


class DownCalendar(FakeCalendar):
    """The Google / MCP path is broken at the venue."""

    def insert(self, calendar_id, event):
        raise ConnectionError("calendar unreachable")

    def list(self, calendar_id, time_min, time_max):
        raise ConnectionError("calendar unreachable")


# ---- .ics / .zip fixtures ----------------------------------------------------

def vevent(uid, summary, dtstart, dtend, extra=""):
    return (
        "BEGIN:VEVENT\r\n"
        f"UID:{uid}\r\n"
        f"SUMMARY:{summary}\r\n"
        f"DTSTART{dtstart}\r\n"
        f"DTEND{dtend}\r\n"
        f"{extra}"
        "END:VEVENT\r\n"
    )


def vcalendar(*events):
    return (
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Google Inc//Google Calendar 70.9054//EN\r\n"
        + "".join(events)
        + "END:VCALENDAR\r\n"
    )


# Sam's exported calendar. One event per timezone style we must normalize.
SAM_ICS = vcalendar(
    # Local time with a TZID.
    vevent("visit-1", "Visit Dana", ";TZID=America/Toronto:20261109T130000",
           ";TZID=America/Toronto:20261109T150000"),
    # UTC: 18:00Z on Nov 10 is 13:00 in Toronto (EST, -05:00).
    vevent("visit-2", "Visit Dana", ":20261110T180000Z", ":20261110T200000Z"),
    # Recurring: every day for a week, from Nov 8.
    vevent("visit-daily", "Daily check-in", ";TZID=America/Toronto:20261108T100000",
           ";TZID=America/Toronto:20261108T103000", "RRULE:FREQ=DAILY;COUNT=7\r\n"),
)


def make_zip(files):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, text in files.items():
            zf.writestr(name, text)
    return buf.getvalue()


def b64(data):
    return base64.b64encode(data).decode()


TAKEOUT_ZIP = make_zip({
    "Takeout/Calendar/sam@example.org.ics": SAM_ICS,
    "Takeout/archive_browser.html": "<html>not a calendar</html>",
})


def by_start(events):
    return sorted(events, key=lambda e: e["starts_at"])


# ---- shared setup ------------------------------------------------------------

class PlannerTestCase(unittest.TestCase):
    def setUp(self):
        # Fresh store per test so writes never leak between tests.
        os.environ["IMW_RUNTIME_FILE"] = str(Path(tempfile.mkdtemp()) / "runtime.json")
        store_module._store = None
        self.gcal = FakeCalendar()
        try:
            tool(actions().set_calendar_client)(self.gcal)
        except ImportError:
            pass  # the test body reports the missing module

    def tearDown(self):
        try:
            tool(actions().set_calendar_client)(None)
        except ImportError:
            pass

    def dana_routine(self, **overrides):
        args = dict(resident="dana", staff="sam", start_time="13:00", length_min=120,
                    start_date="2026-11-08")
        args.update(overrides)
        return tool(profile().save_routine)(**args)


# =============================================================================
# 1. Routine -> visit blocks (plain code, rule 6)
# =============================================================================

class ExpandRoutineTests(unittest.TestCase):
    def test_spec_example_1pm_for_2h_is_seven_daily_blocks(self):
        blocks = core().expand_routine("2026-11-08", "13:00", 120, tz=TZ)
        self.assertEqual(len(blocks), 7, "default is 7 days a week")
        self.assertEqual(blocks[0], {"starts_at": "2026-11-08T13:00:00-05:00",
                                     "ends_at": "2026-11-08T15:00:00-05:00"})
        self.assertEqual(blocks[-1]["starts_at"], "2026-11-14T13:00:00-05:00")

    def test_every_block_is_one_to_three_pm_local(self):
        for b in core().expand_routine("2026-11-08", "13:00", 120, tz=TZ):
            self.assertIn("T13:00:00", b["starts_at"])
            self.assertIn("T15:00:00", b["ends_at"])

    def test_narrowed_days(self):
        # Week of Sun Nov 8: Mon 9, Wed 11, Fri 13.
        blocks = core().expand_routine("2026-11-08", "13:00", 120,
                                       days=["mon", "wed", "fri"], tz=TZ)
        self.assertEqual([b["starts_at"][:10] for b in blocks],
                         ["2026-11-09", "2026-11-11", "2026-11-13"])

    def test_stays_1pm_across_daylight_saving_end(self):
        # DST ends Nov 1, 2026. A naive "+24h in UTC" lands at noon after.
        blocks = core().expand_routine("2026-10-29", "13:00", 120, tz=TZ)
        starts = [b["starts_at"] for b in blocks]
        self.assertIn("2026-10-31T13:00:00-04:00", starts)
        self.assertIn("2026-11-01T13:00:00-05:00", starts)
        self.assertIn("2026-11-02T13:00:00-05:00", starts)

    def test_visit_can_cross_midnight(self):
        blocks = core().expand_routine("2026-11-08", "23:00", 120, days=["sun"], tz=TZ)
        self.assertEqual(blocks, [{"starts_at": "2026-11-08T23:00:00-05:00",
                                   "ends_at": "2026-11-09T01:00:00-05:00"}])

    def test_bad_input_is_rejected_not_guessed(self):
        for bad in [("2026-11-08", "25:00", 120), ("2026-11-08", "13:00", 0),
                    ("2026-11-08", "13:00", -30), ("not-a-date", "13:00", 120)]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                core().expand_routine(*bad, tz=TZ)


# =============================================================================
# 2. Saving a routine (resident-profile MCP)
# =============================================================================

class SaveRoutineTests(PlannerTestCase):
    def test_save_routine_expands_and_waits_for_approval(self):
        out = self.dana_routine()
        self.assertIn("routine_id", out)
        self.assertEqual(len(out["visits"]), 7)
        for v in out["visits"]:
            self.assertEqual(v["staff"], "sam")
            self.assertFalse(v["approved"], "nothing is booked before the resident approves")
            self.assertEqual(v["source"], "resident")

    def test_nothing_reaches_google_on_save(self):
        self.dana_routine()
        self.assertEqual(self.gcal.inserted, [])

    def test_get_planner_shows_the_week(self):
        self.dana_routine()
        week = tool(profile().get_planner)("dana")["visits"]
        self.assertEqual(len(week), 7)
        self.assertEqual(by_start(week)[0]["starts_at"], "2026-11-08T13:00:00-05:00")

    def test_second_routine_is_saved_and_bookable(self):
        """Regression: a second save (runtime file already on disk) once lost
        the routine row while keeping its visits."""
        self.dana_routine()
        second = self.dana_routine(start_time="10:00", length_min=30, days=["sat"])
        out = tool(actions().book_staff_visit)("dana", second["routine_id"], True)
        self.assertNotIn("error", out)
        self.assertEqual(len(out["visits"]), 1)
        self.assertEqual(len(tool(profile().get_planner)("dana")["visits"]), 8)

    def test_preview_shows_the_week_and_saves_nothing(self):
        """Rule 1: the approval card's preview is not saved as Dana's words."""
        out = tool(profile().preview_routine)(resident="dana", staff="sam", start_time="13:00",
                                              length_min=120, start_date="2026-11-08")
        self.assertEqual(len(out["visits"]), 7)
        self.assertEqual(out["visits"][0]["starts_at"], "2026-11-08T13:00:00-05:00")
        self.assertEqual(tool(profile().get_planner)("dana")["visits"], [])

    def test_preview_rejects_bad_input(self):
        out = tool(profile().preview_routine)(resident="dana", staff="sam", start_time="25:00",
                                              length_min=120, start_date="2026-11-08")
        self.assertIn("error", out)

    def test_get_planner_lists_staff_to_choose_from(self):
        staff = tool(profile().get_planner)("dana")["staff"]
        self.assertIn({"id": "sam", "name": "Sam"}, staff)
        self.assertNotIn("priya", [s["id"] for s in staff], "managers aren't offered as visitors")

    def test_unknown_resident_or_staff_is_an_error(self):
        self.assertIn("error", self.dana_routine(resident="nobody"))
        self.assertIn("error", self.dana_routine(staff="nobody"))


# =============================================================================
# 3. Booking onto Google Calendar (the main path)
# =============================================================================

class BookStaffVisitTests(PlannerTestCase):
    def book(self, approved=True):
        rid = self.dana_routine()["routine_id"]
        return rid, tool(actions().book_staff_visit)("dana", rid, approved)

    def test_refuses_without_approval_and_writes_nothing(self):
        rid, out = self.book(approved=False)
        self.assertTrue(out.get("refused"), "rule 5: approval card first")
        self.assertEqual(self.gcal.inserted, [])
        week = tool(profile().get_planner)("dana")["visits"]
        self.assertFalse(any(v["approved"] for v in week))

    def test_approved_routine_lands_on_staff_calendar(self):
        _, out = self.book()
        self.assertEqual(len(self.gcal.inserted), 7, "one event per day")
        self.assertEqual(len(out["google_event_ids"]), 7)
        self.assertTrue(out["google_synced"])

    def test_event_is_1pm_to_3pm_toronto(self):
        self.book()
        _, first = min(self.gcal.inserted, key=lambda ce: ce[1]["start"]["dateTime"])
        self.assertTrue(first["start"]["dateTime"].startswith("2026-11-08T13:00:00"))
        self.assertTrue(first["end"]["dateTime"].startswith("2026-11-08T15:00:00"))
        self.assertEqual(first["start"]["timeZone"], TZ)

    def test_event_says_who_approved_and_nothing_private(self):
        self.book()
        _, event = self.gcal.inserted[0]
        self.assertIn("approved by Dana", event["description"])
        # Only approved visit facts go to Google; never notes, reasons, health info.
        self.assertLessEqual(set(event), {"summary", "description", "start", "end"})

    def test_db_row_is_written_before_google(self):
        """visit_events is the source of truth; Google is a synced view."""
        order = []
        planner_before = tool(profile().get_planner)

        class Spy(FakeCalendar):
            def insert(self, calendar_id, event):
                approved = [v for v in planner_before("dana")["visits"] if v["approved"]]
                order.append(len(approved))
                return super().insert(calendar_id, event)

        tool(actions().set_calendar_client)(Spy())
        self.book()
        self.assertTrue(order and all(n > 0 for n in order),
                        "the approved DB row must exist before the Google call")

    def test_booking_is_logged(self):
        self.book()
        log = store_module.get_store()._runtime.get("action_results", [])
        self.assertTrue(any(r.get("step") == "book_staff_visit" for r in log))

    def test_booking_twice_does_not_double_book(self):
        rid, _ = self.book()
        tool(actions().book_staff_visit)("dana", rid, True)
        self.assertEqual(len(self.gcal.inserted), 7)


# =============================================================================
# 4. Fallback A: Google / MCP is down -> DB-only, same grid
# =============================================================================

class CalendarDownFallbackTests(PlannerTestCase):
    def test_google_failure_still_books_in_the_app(self):
        tool(actions().set_calendar_client)(DownCalendar())
        rid = self.dana_routine()["routine_id"]
        out = tool(actions().book_staff_visit)("dana", rid, True)
        self.assertNotIn("error", out, "a down calendar must not fail the booking")
        self.assertFalse(out["google_synced"])
        week = tool(profile().get_planner)("dana")["visits"]
        self.assertEqual(sum(v["approved"] for v in week), 7)

    def test_no_client_configured_is_db_only(self):
        tool(actions().set_calendar_client)(None)
        rid = self.dana_routine()["routine_id"]
        out = tool(actions().book_staff_visit)("dana", rid, True)
        self.assertFalse(out["google_synced"])
        self.assertEqual(out.get("google_event_ids", []), [])


# =============================================================================
# 5. Fallback B: import_calendar, a .zip export rendered read-only
# =============================================================================

class ZipParseTests(unittest.TestCase):
    def test_finds_ics_and_ignores_other_files(self):
        events = core().parse_calendar_zip(TAKEOUT_ZIP, tz=TZ)
        self.assertTrue(events)
        self.assertTrue(all(e["source_file"].endswith(".ics") for e in events))

    def test_tzid_time_kept_local(self):
        events = core().parse_calendar_zip(TAKEOUT_ZIP, tz=TZ)
        visit1 = next(e for e in events if e["starts_at"].startswith("2026-11-09"))
        self.assertEqual(visit1["starts_at"], "2026-11-09T13:00:00-05:00")
        self.assertEqual(visit1["ends_at"], "2026-11-09T15:00:00-05:00")
        self.assertEqual(visit1["title"], "Visit Dana")

    def test_utc_time_normalized_to_toronto(self):
        events = core().parse_calendar_zip(TAKEOUT_ZIP, tz=TZ)
        self.assertIn("2026-11-10T13:00:00-05:00", [e["starts_at"] for e in events],
                      "18:00Z must become 1:00pm local, not stay at 6pm")

    def test_recurrence_rule_is_kept(self):
        events = core().parse_calendar_zip(TAKEOUT_ZIP, tz=TZ)
        daily = next(e for e in events if e["title"] == "Daily check-in")
        self.assertEqual(daily["recurrence"], ["RRULE:FREQ=DAILY;COUNT=7"])

    def test_not_a_zip_raises_value_error(self):
        with self.assertRaises(ValueError):
            core().parse_calendar_zip(b"definitely not a zip", tz=TZ)

    def test_unsafe_paths_are_skipped(self):
        evil = make_zip({"../../escape.ics": SAM_ICS, "/abs/escape.ics": SAM_ICS})
        self.assertEqual(core().parse_calendar_zip(evil, tz=TZ), [])

    def test_zip_with_no_calendar_is_empty(self):
        self.assertEqual(core().parse_calendar_zip(make_zip({"notes.txt": "hi"}), tz=TZ), [])


class ImportCalendarFallbackTests(PlannerTestCase):
    def test_renders_staff_hours_on_the_grid(self):
        out = tool(actions().import_calendar)("dana", b64(TAKEOUT_ZIP))
        self.assertNotIn("error", out)
        starts = [v["starts_at"] for v in out["visits"]]
        self.assertIn("2026-11-09T13:00:00-05:00", starts)
        self.assertIn("2026-11-10T13:00:00-05:00", starts)

    def test_recurring_event_expands_on_the_grid(self):
        out = tool(actions().import_calendar)("dana", b64(TAKEOUT_ZIP))
        daily = [v for v in out["visits"] if v["title"] == "Daily check-in"]
        self.assertEqual(len(daily), 7)

    def test_labelled_from_staff_calendar_not_residents_words(self):
        out = tool(actions().import_calendar)("dana", b64(TAKEOUT_ZIP))
        for v in out["visits"]:
            self.assertEqual(v["source"], "staff")
            self.assertTrue(v["label"].startswith("From staff calendar"))

    def test_display_only_never_writes_to_google(self):
        tool(actions().import_calendar)("dana", b64(TAKEOUT_ZIP))
        self.assertEqual(self.gcal.inserted, [], "the fallback is read-only")

    def test_works_when_google_is_down(self):
        tool(actions().set_calendar_client)(DownCalendar())
        out = tool(actions().import_calendar)("dana", b64(TAKEOUT_ZIP))
        self.assertTrue(out["visits"])

    def test_bad_upload_is_a_friendly_error(self):
        out = tool(actions().import_calendar)("dana", b64(b"not a zip"))
        self.assertIn("error", out)
        out = tool(actions().import_calendar)("dana", "%%% not base64 %%%")
        self.assertIn("error", out)


# =============================================================================
# 6. Staff calendar import (stretch): .zip -> approval card -> events.insert
# =============================================================================

class StaffCalendarImportTests(PlannerTestCase):
    def propose(self):
        return tool(actions().propose_calendar_import)("sam", b64(TAKEOUT_ZIP))

    def test_propose_writes_nothing(self):
        out = self.propose()
        self.assertIn("import_id", out)
        self.assertEqual(len(out["events"]), 3)
        self.assertEqual(self.gcal.inserted, [], "review comes before any write")

    def test_propose_events_are_normalized(self):
        starts = [e["starts_at"] for e in self.propose()["events"]]
        self.assertIn("2026-11-10T13:00:00-05:00", starts)

    def test_propose_flags_overlap_with_existing_events(self):
        self.gcal.existing = [{
            "summary": "Visit Dana",
            "start": {"dateTime": "2026-11-09T13:00:00-05:00", "timeZone": TZ},
            "end": {"dateTime": "2026-11-09T15:00:00-05:00", "timeZone": TZ},
        }]
        events = self.propose()["events"]
        dup = next(e for e in events if e["starts_at"] == "2026-11-09T13:00:00-05:00")
        self.assertTrue(dup["duplicate"])
        self.assertFalse(any(e["duplicate"] for e in events if e is not dup))

    def test_commit_refuses_without_approval(self):
        p = self.propose()
        ids = [e["id"] for e in p["events"]]
        out = tool(actions().commit_calendar_import)("sam", p["import_id"], ids, False)
        self.assertTrue(out.get("refused"))
        self.assertEqual(self.gcal.inserted, [])

    def test_commit_inserts_each_approved_event(self):
        p = self.propose()
        ids = [e["id"] for e in p["events"]]
        out = tool(actions().commit_calendar_import)("sam", p["import_id"], ids, True)
        self.assertEqual(len(self.gcal.inserted), 3)
        self.assertEqual(len(out["google_event_ids"]), 3)

    def test_commit_only_inserts_what_staff_ticked(self):
        p = self.propose()
        out = tool(actions().commit_calendar_import)("sam", p["import_id"], [p["events"][0]["id"]], True)
        self.assertEqual(len(self.gcal.inserted), 1)
        self.assertEqual(len(out["google_event_ids"]), 1)

    def test_commit_skips_duplicates(self):
        self.gcal.existing = [{
            "summary": "Visit Dana",
            "start": {"dateTime": "2026-11-09T13:00:00-05:00", "timeZone": TZ},
            "end": {"dateTime": "2026-11-09T15:00:00-05:00", "timeZone": TZ},
        }]
        p = self.propose()
        ids = [e["id"] for e in p["events"]]
        out = tool(actions().commit_calendar_import)("sam", p["import_id"], ids, True)
        self.assertEqual(len(self.gcal.inserted), 2)
        self.assertEqual(len(out["skipped"]), 1)

    def test_commit_keeps_recurrence(self):
        p = self.propose()
        tool(actions().commit_calendar_import)("sam", p["import_id"], [e["id"] for e in p["events"]], True)
        daily = next(ev for _, ev in self.gcal.inserted if ev["summary"] == "Daily check-in")
        self.assertEqual(daily["recurrence"], ["RRULE:FREQ=DAILY;COUNT=7"])

    def test_commit_rejects_ids_not_in_the_proposal(self):
        p = self.propose()
        out = tool(actions().commit_calendar_import)("sam", p["import_id"], ["made-up"], True)
        self.assertIn("error", out)
        self.assertEqual(self.gcal.inserted, [])

    def test_commit_unknown_import_is_an_error(self):
        out = tool(actions().commit_calendar_import)("sam", "no-such-import", [], True)
        self.assertIn("error", out)

    def test_commit_twice_does_not_double_insert(self):
        p = self.propose()
        ids = [e["id"] for e in p["events"]]
        tool(actions().commit_calendar_import)("sam", p["import_id"], ids, True)
        tool(actions().commit_calendar_import)("sam", p["import_id"], ids, True)
        self.assertEqual(len(self.gcal.inserted), 3)

    def test_commit_when_google_down_reports_not_crashes(self):
        p = self.propose()
        tool(actions().set_calendar_client)(DownCalendar())
        out = tool(actions().commit_calendar_import)("sam", p["import_id"], [e["id"] for e in p["events"]], True)
        self.assertIn("error", out)


if __name__ == "__main__":
    unittest.main()

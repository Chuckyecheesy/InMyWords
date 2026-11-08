"""The planner + agent tests again, on the real PostgresStore.

Skipped unless PLANNER_PG_TEST_URL points at a throwaway Postgres (with
pgvector) loaded by db/reset.py, e.g.

    docker run -d --rm --name imw-pgtest -e POSTGRES_PASSWORD=imwtest \\
      -e POSTGRES_DB=imw -p 55432:5432 pgvector/pgvector:pg16
    DATABASE_URL=postgresql://postgres:imwtest@127.0.0.1:55432/imw GEMINI_API_KEY= \\
      python db/reset.py
    PLANNER_PG_TEST_URL=postgresql://postgres:imwtest@127.0.0.1:55432/imw \\
      python -m unittest tests.test_planner_postgres

It TRUNCATES the planner tables between tests, so it refuses any database
that isn't on this machine (never the shared Tiger Data instance).
"""

import os
import sys
import unittest
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "mcp"))

from tests import test_planner_agent as agent_tests  # noqa: E402
from tests import test_planner_calendar as cal_tests  # noqa: E402
import store as store_module  # noqa: E402

PG_URL = os.environ.get("PLANNER_PG_TEST_URL", "").strip()

if not PG_URL:
    SKIP = "PLANNER_PG_TEST_URL is not set"
elif urlparse(PG_URL).hostname not in {"127.0.0.1", "localhost", "::1"}:
    SKIP = "PLANNER_PG_TEST_URL must be a local throwaway DB; these tests truncate tables"
else:
    SKIP = None


def _execute(pg, sql):
    with pg._conn() as conn:
        conn.execute(sql)


class PostgresMixin:
    """Run the inherited tests on PostgresStore, with clean planner tables."""

    def setUp(self):
        super().setUp()  # the base setup: fake calendar, fresh store
        self.pg = store_module._store = store_module.PostgresStore(PG_URL)
        _execute(self.pg, "TRUNCATE calendar_imports, visit_events, routines RESTART IDENTITY CASCADE")
        _execute(self.pg, "DELETE FROM action_results WHERE plan_id IS NULL")

    def tearDown(self):
        super().tearDown()
        store_module._store = None


BASES = [
    cal_tests.SaveRoutineTests, cal_tests.BookStaffVisitTests, cal_tests.CalendarDownFallbackTests,
    cal_tests.ImportCalendarFallbackTests, cal_tests.StaffCalendarImportTests,
    agent_tests.GeminiWritesTheEvents, agent_tests.Guardrails, agent_tests.DeterministicFallback,
    agent_tests.StaffImportAgent,
]
# Seed-store details with a Postgres equivalent below.
SEED_ONLY = {"test_booking_is_logged"}

for _base in BASES:
    _skips = {name: unittest.skip("seed-store detail; see PGStoreTests")(lambda self: None)
              for name in SEED_ONLY if hasattr(_base, name)}
    _cls = type(f"PG{_base.__name__}", (PostgresMixin, _base), {"__module__": __name__, **_skips})
    globals()[_cls.__name__] = unittest.skipIf(SKIP is not None, SKIP or "")(_cls)


@unittest.skipIf(SKIP is not None, SKIP or "")
class PGStoreTests(PostgresMixin, cal_tests.PlannerTestCase):
    """Things only a real Postgres can get wrong."""

    def test_booking_is_logged_in_action_results(self):
        rid = self.dana_routine()["routine_id"]
        cal_tests.tool(cal_tests.actions().book_staff_visit)("dana", rid, True)
        rows = self.pg._all("SELECT step FROM action_results WHERE plan_id IS NULL")
        self.assertEqual(sum(r["step"] == "book_staff_visit" for r in rows), 7)

    def test_times_round_trip_as_toronto_iso(self):
        """TIMESTAMPTZ comes back as a datetime in the session's zone; the
        store must return the same ISO-with-offset strings as the seed store."""
        self.dana_routine()
        week = cal_tests.tool(cal_tests.profile().get_planner)("dana")["visits"]
        self.assertEqual(week[0]["starts_at"], "2026-11-08T13:00:00-05:00")
        self.assertEqual(week[0]["ends_at"], "2026-11-08T15:00:00-05:00")

    def test_times_survive_a_utc_session(self):
        _execute(self.pg, "SET TIME ZONE 'UTC'")
        self.dana_routine()
        week = cal_tests.tool(cal_tests.profile().get_planner)("dana")["visits"]
        self.assertEqual(week[0]["starts_at"], "2026-11-08T13:00:00-05:00")

    def test_routine_days_stored_as_json(self):
        rid = self.dana_routine(days=["mon", "wed"])["routine_id"]
        self.assertEqual(self.pg.get_routine(rid)["days"], ["mon", "wed"])

    def test_import_committed_map_accumulates(self):
        p = cal_tests.tool(cal_tests.actions().propose_calendar_import)("sam", cal_tests.b64(cal_tests.TAKEOUT_ZIP))
        ids = [e["id"] for e in p["events"]]
        cal_tests.tool(cal_tests.actions().commit_calendar_import)("sam", p["import_id"], ids, True)
        committed = self.pg.get_calendar_import(p["import_id"])["committed"]
        self.assertEqual(sorted(committed), sorted(ids))

    def test_db_rejects_a_visit_that_ends_before_it_starts(self):
        import psycopg
        with self.assertRaises(psycopg.errors.CheckViolation):
            _execute(self.pg, "INSERT INTO visit_events (resident_id, staff_id, starts_at, ends_at) "
                              "VALUES ('dana','sam','2026-11-08T15:00-05:00','2026-11-08T13:00-05:00')")


if __name__ == "__main__":
    unittest.main()

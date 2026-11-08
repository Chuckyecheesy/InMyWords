"""Planner routes enforce the account and resident scope introduced on main."""

import os
import sys
import unittest
from unittest import mock

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import main  # noqa: E402


class PlannerAuthTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self.auth = mock.patch.dict(os.environ, {"IMW_AUTH": "required"})
        self.auth.start()
        self.addCleanup(self.auth.stop)
        self.addCleanup(main.app.dependency_overrides.clear)

    def scope(self, session, assignments=()):
        main.app.dependency_overrides[main.current_scope] = lambda: {
            "session": session, "assignments": list(assignments)
        }

    def test_resident_routes_reject_missing_and_other_sessions(self):
        requests = [
            ("get", "/planner/dana", None),
            ("post", "/planner/preview", {"resident_id": "dana", "person": "sam", "start": "13:00", "length_min": 60}),
            ("post", "/planner/routine", {"resident_id": "dana", "person": "sam", "start": "13:00", "length_min": 60}),
            ("post", "/planner/book", {"resident_id": "dana", "routine_id": 1, "approved": True}),
            ("post", "/planner/import", {"resident_id": "dana", "calendar_zip_b64": ""}),
        ]
        for session, status in [(None, 401), ({"role": "resident", "rid": "marcus"}, 403)]:
            self.scope(session)
            for method, path, body in requests:
                with self.subTest(path=path, status=status):
                    response = self.client.request(method, path, json=body)
                    self.assertEqual(response.status_code, status)

    def test_staff_routes_reject_impersonation_and_residents(self):
        requests = [
            ("/planner/respond", {"staff_id": "sam", "visit_ids": [1], "decision": "accept"}),
            ("/planner/import/propose", {"staff_id": "sam", "calendar_zip_b64": ""}),
            ("/planner/import/commit", {"staff_id": "sam", "import_id": "1", "approved_ids": [], "approved": True}),
        ]
        for session, status in [
            (None, 401),
            ({"role": "resident", "rid": "dana"}, 403),
            ({"role": "staff", "sid": "jordan"}, 403),
        ]:
            self.scope(session)
            for path, body in requests:
                with self.subTest(path=path, status=status):
                    self.assertEqual(self.client.post(path, json=body).status_code, status)

    def test_visit_response_checks_assignment_and_fails_closed(self):
        self.scope({"role": "staff", "sid": "sam"}, ["dana"])
        body = {"staff_id": "sam", "visit_ids": [1], "decision": "accept"}
        with mock.patch.object(main.mcp_client, "get_planner", new_callable=mock.AsyncMock) as get_planner:
            get_planner.return_value = {"visits": [{"id": 2}]}
            self.assertEqual(self.client.post("/planner/respond", json=body).status_code, 403)
            get_planner.side_effect = RuntimeError("offline")
            self.assertEqual(self.client.post("/planner/respond", json=body).status_code, 503)
            get_planner.side_effect = None
            get_planner.return_value = {"visits": [{"id": 1}]}
            with mock.patch("agents.planner.respond_visits", return_value={"visits": []}), \
                    mock.patch("agents.planner.default_run_tools", return_value=None):
                self.assertEqual(self.client.post("/planner/respond", json=body).status_code, 200)


if __name__ == "__main__":
    unittest.main()

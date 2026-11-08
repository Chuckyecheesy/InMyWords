"""Accounts & privacy (ROADMAP Phase 2): hashing, sessions, scope rules."""

import os
import sys
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services import auth  # noqa: E402


class TestSecrets(unittest.TestCase):
    def test_roundtrip(self):
        stored = auth.hash_secret("1234")
        self.assertTrue(auth.verify_secret("1234", stored))
        self.assertFalse(auth.verify_secret("1235", stored))

    def test_raw_secret_never_in_hash(self):
        self.assertNotIn("sunflower", auth.hash_secret("sunflower"))

    def test_garbage_stored_value_is_just_false(self):
        self.assertFalse(auth.verify_secret("1234", "not-a-hash"))
        self.assertFalse(auth.verify_secret("1234", ""))
        self.assertFalse(auth.verify_secret("1234", None))


class TestSessions(unittest.TestCase):
    def test_resident_session_roundtrip_and_no_expiry(self):
        token = auth.issue_session({"id": 1, "role": "resident", "resident_id": "marcus",
                                    "display_name": "Marcus"})
        session = auth.read_session(token)
        self.assertEqual(session["role"], "resident")
        self.assertEqual(session["rid"], "marcus")
        self.assertNotIn("exp", session)  # no time limits for residents

    def test_staff_session_expires(self):
        token = auth.issue_session({"id": 2, "role": "staff", "staff_id": "sam",
                                    "display_name": "Sam"})
        session = auth.read_session(token)
        self.assertLessEqual(session["exp"], time.time() + auth.STAFF_SESSION_SECONDS + 5)

    def test_tampered_token_rejected(self):
        token = auth.issue_session({"id": 1, "role": "resident", "resident_id": "marcus",
                                    "display_name": "Marcus"})
        _, sig = token.rsplit(".", 1)
        forged_body = auth._b64(b'{"uid":1,"role":"resident","rid":"dana","sid":null,"name":"M"}')
        self.assertIsNone(auth.read_session(f"{forged_body}.{sig}"))
        self.assertIsNone(auth.read_session("garbage"))
        self.assertIsNone(auth.read_session(None))


class TestScope(unittest.TestCase):
    def test_resident_sees_self_only(self):
        session = {"role": "resident", "rid": "dana"}
        self.assertTrue(auth.can_access(session, "dana", []))
        self.assertFalse(auth.can_access(session, "marcus", []))

    def test_staff_sees_assigned_only(self):
        session = {"role": "staff", "sid": "jordan"}
        self.assertTrue(auth.can_access(session, "marcus", ["marcus"]))
        self.assertFalse(auth.can_access(session, "dana", ["marcus"]))

    def test_manager_sees_all(self):
        self.assertTrue(auth.can_access({"role": "manager"}, "anyone", []))

    def test_open_mode_allows_anonymous_but_required_does_not(self):
        old = os.environ.get("IMW_AUTH")
        try:
            os.environ["IMW_AUTH"] = "open"
            self.assertTrue(auth.can_access(None, "marcus", []))
            os.environ["IMW_AUTH"] = "required"
            self.assertFalse(auth.can_access(None, "marcus", []))
        finally:
            if old is None:
                os.environ.pop("IMW_AUTH", None)
            else:
                os.environ["IMW_AUTH"] = old


if __name__ == "__main__":
    unittest.main()

"""Planner subagent: Gemini writes the calendar events through MCP; the
deterministic route takes over when it can't. Offline.

A scripted stand-in plays Gemini. It reads the same prompt the real model
gets and makes tool calls through the same execute() hook, so every guardrail
on the way to the MCP server is the real code. Google Calendar is a fake.
"""

import os
import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "mcp"))
os.environ["DATABASE_URL"] = ""
os.environ["IMW_RUNTIME_FILE"] = str(Path(tempfile.mkdtemp()) / "runtime.json")
os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"] = ""

import actions_server  # noqa: E402
import profile_server  # noqa: E402
import store as store_module  # noqa: E402
from agents import planner  # noqa: E402
from tests.test_planner_calendar import TAKEOUT_ZIP, DownCalendar, FakeCalendar, b64  # noqa: E402


def tool(t):
    return getattr(t, "fn", t)


def call_tool(name, args):
    """In-process MCP: the same tool functions the servers expose."""
    fn = getattr(actions_server, name, None) or getattr(profile_server, name)
    return tool(fn)(**args)


VISIT_LINE = re.compile(r"visit_id=(\d+) staff=\S+ start=(\S+) end=(\S+)")
EVENT_LINE = re.compile(r"event_id=(\S+) title='([^']*)' start=(\S+) end=(\S+)")


class ScriptedGemini:
    """Stands in for services.gemini.run_tools."""

    def __init__(self, mode="good", limit=None):
        self.mode, self.limit, self.ran, self.prompts = mode, limit, 0, []

    def __call__(self, feature, prompt, functions, execute, *, system=None, max_turns=6,
                 should_stop=None, **options):
        self.options = options
        self.ran += 1
        self.prompts.append(prompt)
        assert feature == "planner" and len(functions) == 1
        name = functions[0]["name"]
        if self.mode == "raises":
            raise RuntimeError("503 model overloaded")
        calls = []
        if name == "write_calendar_event":
            visits = VISIT_LINE.findall(prompt)[: self.limit]
            for vid, start, end in visits:
                args = {"visit_id": int(vid), "start": start, "end": end,
                        "summary": "Visit with Dana", "description": "Dana picked this visit herself."}
                if self.mode == "wrong_times":
                    args["start"] = start.replace("T13:", "T14:")
                if self.mode == "invents":
                    args["visit_id"] = 9999
                if self.mode == "leaky":
                    args["description"] = "Call her sister at 519-555-0199 or lisa@example.com, $40"
                calls.append({"name": name, "args": args, "result": execute(name, args)})
                if should_stop and should_stop(calls):
                    break
        else:
            for eid, title, start, end in EVENT_LINE.findall(prompt)[: self.limit]:
                args = {"event_id": eid, "start": start, "end": end, "summary": title}
                calls.append({"name": name, "args": args, "result": execute(name, args)})
                if should_stop and should_stop(calls):
                    break
        return {"calls": calls, "text": "done", "turns": 1, "model": "fake", "finished": True}


class AgentCase(unittest.TestCase):
    def setUp(self):
        os.environ["IMW_RUNTIME_FILE"] = str(Path(tempfile.mkdtemp()) / "runtime.json")
        store_module._store = None
        self.gcal = FakeCalendar()
        actions_server.set_calendar_client(self.gcal)

    def tearDown(self):
        actions_server.set_calendar_client(None)

    def routine(self):
        return tool(profile_server.save_routine)(resident="dana", staff="sam", start_time="13:00",
                                                 length_min=120, start_date="2026-11-08")["routine_id"]

    def book(self, gemini, approved=True, routine_id=None):
        """Dana approves (nothing on Google yet), then Sam accepts: the Planner
        subagent writes the accepted visits (PROJECT_PLAN §2.5)."""
        rid = routine_id or self.routine()
        booked = planner.book_visits("dana", rid, approved, call_tool=call_tool, run_tools=gemini)
        if booked.get("refused") or booked.get("error"):
            return booked
        pending = [v["id"] for v in booked["visits"] if v["status"] == "pending"]
        if not pending:  # already answered: re-syncing must never double-book
            return call_tool("sync_accepted_visits", {"staff": "sam",
                                                      "visit_ids": [v["id"] for v in booked["visits"]]})
        return planner.respond_visits("sam", pending, "accept", call_tool=call_tool, run_tools=gemini)

    def starts(self):
        return sorted(ev["start"]["dateTime"] for _, ev in self.gcal.inserted)


class GeminiWritesTheEvents(AgentCase):
    def test_gemini_does_the_writing(self):
        out = self.book(ScriptedGemini())
        self.assertEqual(out["planner"], "gemini")
        self.assertEqual(out["agent"]["gemini_wrote"], 7)
        self.assertEqual(out["agent"]["rules_wrote"], 0)
        self.assertTrue(out["google_synced"])
        self.assertEqual(len(self.gcal.inserted), 7)

    def test_gemini_wording_is_used_and_still_says_approved_by(self):
        self.book(ScriptedGemini())
        _, event = self.gcal.inserted[0]
        self.assertEqual(event["summary"], "Visit with Dana")
        self.assertIn("Dana picked this visit herself", event["description"])
        self.assertIn("approved by Dana", event["description"])

    def test_times_on_google_are_1pm_to_3pm(self):
        self.book(ScriptedGemini())
        self.assertTrue(all("T13:00:00" in s for s in self.starts()))

    def test_prompt_lists_every_approved_visit_with_exact_times(self):
        g = ScriptedGemini()
        self.book(g)
        self.assertEqual(len(VISIT_LINE.findall(g.prompts[0])), 7)
        self.assertIn("start=2026-11-08T13:00:00-05:00 end=2026-11-08T15:00:00-05:00", g.prompts[0])

    def test_running_twice_never_double_books(self):
        rid = self.routine()
        self.book(ScriptedGemini(), routine_id=rid)
        again = self.book(ScriptedGemini(), routine_id=rid)
        self.assertEqual(len(self.gcal.inserted), 7)
        self.assertTrue(again["google_synced"])


class Guardrails(AgentCase):
    def test_no_approval_means_gemini_never_runs(self):
        g = ScriptedGemini()
        out = self.book(g, approved=False)
        self.assertTrue(out.get("refused"))
        self.assertEqual(g.ran, 0)
        self.assertEqual(self.gcal.inserted, [])

    def test_wrong_times_are_rejected_then_rules_write_the_right_ones(self):
        out = self.book(ScriptedGemini("wrong_times"))
        self.assertEqual(out["agent"]["rejected_calls"], 7)
        self.assertEqual(out["planner"], "rules")
        self.assertEqual(len(self.gcal.inserted), 7)
        self.assertTrue(all("T13:00:00" in s for s in self.starts()), "no 2pm event ever reached Google")

    def test_invented_visit_never_reaches_the_server(self):
        out = self.book(ScriptedGemini("invents"))
        self.assertEqual(out["agent"]["rejected_calls"], 7)
        self.assertEqual(out["planner"], "rules")
        self.assertEqual(len(self.gcal.inserted), 7)

    def test_private_details_in_model_text_are_stripped(self):
        self.book(ScriptedGemini("leaky"))
        _, event = self.gcal.inserted[0]
        self.assertNotIn("519", event["description"])
        self.assertNotIn("@", event["description"])
        self.assertNotIn("$", event["description"])
        self.assertIn("approved by Dana", event["description"])

    def test_models_own_approval_sentence_is_not_doubled(self):
        """Live Gemini wrote 'Dana approved this visit.'; don't append a second one."""
        rid = self.routine()
        visit = call_tool("approve_visits", {"resident": "dana", "routine_id": rid, "approved": True})["visits"][0]
        call_tool("respond_to_visit", {"staff": "sam", "visit_ids": [visit["id"]], "decision": "accept"})
        call_tool("write_calendar_event", {"resident": "dana", "visit_id": visit["id"],
                                           "start": visit["starts_at"], "end": visit["ends_at"],
                                           "summary": "Visit with Dana", "description": "Dana approved this visit."})
        self.assertEqual(self.gcal.inserted[0][1]["description"], "Dana approved this visit.")

    def test_gated_write_refuses_an_unapproved_visit(self):
        visit = tool(profile_server.save_routine)(resident="dana", staff="sam", start_time="13:00",
                                                  length_min=120, start_date="2026-11-08")["visits"][0]
        out = call_tool("write_calendar_event", {"resident": "dana", "visit_id": visit["id"],
                                                 "start": visit["starts_at"], "end": visit["ends_at"]})
        self.assertTrue(out.get("refused"))
        self.assertEqual(self.gcal.inserted, [])

    def test_gated_write_refuses_another_residents_visit(self):
        self.book(None)
        visit = tool(profile_server.get_planner)("dana")["visits"][0]
        out = call_tool("write_calendar_event", {"resident": "marcus", "visit_id": visit["id"],
                                                 "start": visit["starts_at"], "end": visit["ends_at"]})
        self.assertIn("error", out)


class DeterministicFallback(AgentCase):
    def test_gemini_error_falls_back_to_rules(self):
        out = self.book(ScriptedGemini("raises"))
        self.assertEqual(out["planner"], "rules")
        self.assertEqual(out["agent"]["rules_wrote"], 7)
        self.assertIn("Gemini failed", out["agent"]["fallback_reason"])
        self.assertTrue(out["google_synced"])

    def test_one_gemini_attempt_then_rules_not_a_second_model(self):
        g = ScriptedGemini()
        self.book(g)
        self.assertFalse(g.options["use_fallback_model"])
        self.assertLessEqual(g.options["timeout_ms"], 15000)

    def test_model_error_after_all_writes_needs_no_fallback(self):
        """Seen live: every write ran, then a 503 on Gemini's wrap-up turn."""
        inner = ScriptedGemini()

        def writes_then_503(*a, **k):
            inner(*a, **k)
            raise RuntimeError("503 UNAVAILABLE")
        out = self.book(writes_then_503)
        self.assertEqual(out["planner"], "gemini")
        self.assertEqual(out["agent"]["model_calls"], 7)
        self.assertEqual(out["agent"]["rules_wrote"], 0)
        self.assertEqual(out["agent"]["fallback_reason"], "")
        self.assertEqual(len(self.gcal.inserted), 7)

    def test_gemini_off_uses_rules(self):
        out = self.book(None)
        self.assertEqual(out["planner"], "rules")
        self.assertEqual(out["agent"]["fallback_reason"], "Gemini is off")
        self.assertEqual(len(self.gcal.inserted), 7)

    def test_gemini_stops_early_rules_finish_without_duplicates(self):
        out = self.book(ScriptedGemini(limit=3))
        self.assertEqual(out["planner"], "gemini+rules")
        self.assertEqual((out["agent"]["gemini_wrote"], out["agent"]["rules_wrote"]), (3, 4))
        self.assertEqual(len(self.gcal.inserted), 7)
        self.assertEqual(len(set(self.starts())), 7)

    def test_calendar_down_stops_gemini_and_keeps_the_booking_in_the_app(self):
        actions_server.set_calendar_client(DownCalendar())
        out = self.book(ScriptedGemini())
        self.assertFalse(out["google_synced"])
        self.assertEqual(out["agent"]["fallback_reason"], "the calendar is down")
        week = tool(profile_server.get_planner)("dana")["visits"]
        self.assertEqual(sum(v["approved"] for v in week), 7)


class StaffImportAgent(AgentCase):
    def run_import(self, gemini, approved=True, ids=None):
        p = tool(actions_server.propose_calendar_import)("sam", b64(TAKEOUT_ZIP))
        ids = ids if ids is not None else [e["id"] for e in p["events"]]
        return planner.import_events("sam", p["import_id"], ids, approved,
                                     call_tool=call_tool, run_tools=gemini)

    def test_gemini_imports_every_event(self):
        out = self.run_import(ScriptedGemini())
        self.assertEqual(out["planner"], "gemini")
        self.assertEqual(len(self.gcal.inserted), 3)
        daily = next(ev for _, ev in self.gcal.inserted if ev["summary"] == "Daily check-in")
        self.assertEqual(daily["recurrence"], ["RRULE:FREQ=DAILY;COUNT=7"])

    def test_duplicates_skipped_on_the_gemini_route(self):
        self.gcal.existing = [{"start": {"dateTime": "2026-11-09T13:00:00-05:00"},
                               "end": {"dateTime": "2026-11-09T15:00:00-05:00"}}]
        out = self.run_import(ScriptedGemini())
        self.assertEqual(len(self.gcal.inserted), 2)
        self.assertEqual(len(out["skipped"]), 1)

    def test_gemini_error_falls_back_to_deterministic_commit(self):
        out = self.run_import(ScriptedGemini("raises"))
        self.assertEqual(out["planner"], "rules")
        self.assertEqual(len(self.gcal.inserted), 3)

    def test_not_approved_means_nothing_runs(self):
        g = ScriptedGemini()
        out = self.run_import(g, approved=False)
        self.assertTrue(out.get("refused"))
        self.assertEqual((g.ran, self.gcal.inserted), (0, []))

    def test_gemini_cannot_write_an_event_staff_did_not_tick(self):
        p = tool(actions_server.propose_calendar_import)("sam", b64(TAKEOUT_ZIP))
        first, second = p["events"][0], p["events"][1]
        call_tool("approve_calendar_import", {"staff": "sam", "import_id": p["import_id"],
                                              "approved_ids": [first["id"]], "approved": True})
        out = call_tool("write_imported_event", {"staff": "sam", "import_id": p["import_id"],
                                                 "event_id": second["id"], "start": second["starts_at"],
                                                 "end": second["ends_at"]})
        self.assertIn("error", out)
        self.assertEqual(self.gcal.inserted, [])


class RunToolsLoop(unittest.TestCase):
    """services.gemini.run_tools with a fake google-genai client."""

    def setUp(self):
        from google.genai import types
        self.types = types

    def response(self, calls=None, text=""):
        t = self.types
        fcs = [t.FunctionCall(name=n, args=a) for n, a in (calls or [])]
        content = t.Content(role="model", parts=[t.Part(function_call=fc) for fc in fcs] or
                            [t.Part.from_text(text=text or "done")])

        class R:
            pass
        r = R()
        r.function_calls, r.text = fcs or None, text
        r.candidates = [type("C", (), {"content": content})()]
        return r

    def client(self, script):
        outer = self

        class Models:
            def __init__(self):
                self.seen = []

            def generate_content(self, model, contents, config):
                self.seen.append((model, list(contents), config))
                step = script.pop(0)
                if isinstance(step, Exception):
                    raise step
                return step

        class Client:
            models = Models()
        outer.models = Client.models
        return Client()

    def test_runs_calls_and_feeds_results_back(self):
        from services.gemini import run_tools
        ran = []
        script = [self.response([("write_calendar_event", {"visit_id": 1})]), self.response(text="done")]
        out = run_tools("planner", "write it", [planner.WRITE_VISIT],
                        lambda n, a: ran.append((n, a)) or {"google_event_id": "g1"},
                        client=self.client(script))
        self.assertEqual(ran, [("write_calendar_event", {"visit_id": 1})])
        self.assertTrue(out["finished"])
        self.assertEqual(out["calls"][0]["result"], {"google_event_id": "g1"})
        _, second_contents, config = self.models.seen[1]
        reply = second_contents[-1].parts[0].function_response
        self.assertEqual(reply.response, {"google_event_id": "g1"})
        self.assertEqual(config["automatic_function_calling"], {"disable": True})

    def test_falls_back_to_second_model_only_before_any_call(self):
        from services.gemini import models_for, run_tools
        script = [RuntimeError("503"), self.response(text="done")]
        out = run_tools("planner", "write it", [planner.WRITE_VISIT], lambda n, a: {},
                        client=self.client(script))
        self.assertEqual(out["model"], models_for("planner")[1])

    def test_single_model_mode_does_not_try_the_fallback(self):
        from services.gemini import run_tools
        script = [RuntimeError("504"), self.response(text="done")]
        with self.assertRaises(RuntimeError):
            run_tools("planner", "write it", [planner.WRITE_VISIT], lambda n, a: {},
                      client=self.client(script), use_fallback_model=False)
        self.assertEqual(len(self.models.seen), 1)

    def test_never_replays_writes_on_another_model(self):
        from services.gemini import run_tools
        ran = []
        script = [self.response([("write_calendar_event", {"visit_id": 1})]), RuntimeError("503")]
        with self.assertRaises(RuntimeError):
            run_tools("planner", "write it", [planner.WRITE_VISIT],
                      lambda n, a: ran.append(n) or {"ok": True}, client=self.client(script))
        self.assertEqual(len(ran), 1)

    def test_bad_call_is_reported_to_the_model_not_raised(self):
        from services.gemini import run_tools

        def boom(n, a):
            raise ValueError("nope")
        script = [self.response([("write_calendar_event", {})]), self.response(text="ok")]
        out = run_tools("planner", "go", [planner.WRITE_VISIT], boom, client=self.client(script))
        self.assertIn("error", out["calls"][0]["result"])


if __name__ == "__main__":
    unittest.main()

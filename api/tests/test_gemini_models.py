"""Per-feature models and the fallback retry (services/gemini.py)."""

import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services import gemini  # noqa: E402


class ModelChoiceTests(unittest.TestCase):
    def test_waiting_features_use_the_steady_model_first(self):
        self.assertEqual(gemini.models_for("coach")[0], "gemini-3.5-flash")

    def test_hard_features_use_steady_then_the_newer_model(self):
        for feature in ("memory", "story"):
            self.assertEqual(gemini.models_for(feature), ["gemini-3.5-flash", "gemini-3.8-flash"])

    def test_easy_memory_work_uses_lite_then_steady(self):
        self.assertEqual(gemini.models_for("memory_easy"),
                         ["gemini-3.5-flash-lite", "gemini-3.5-flash"])

    def test_voice_uses_lite_first_then_steady(self):
        self.assertEqual(gemini.models_for("voice"),
                         ["gemini-3.5-flash-lite", "gemini-3.5-flash"])

    def test_environment_overrides_primary(self):
        with mock.patch.dict(os.environ, {"GEMINI_MODEL_MEMORY": "gemini-x"}):
            self.assertEqual(gemini.models_for("memory")[0], "gemini-x")


class FallbackTests(unittest.TestCase):
    def run_with(self, behaviours, feature="memory"):
        calls = []

        def fake(prompt, schema, *, model=None, **kw):
            calls.append((model, kw.get("timeout_ms")))
            result = behaviours[len(calls) - 1]
            if isinstance(result, Exception):
                raise result
            return result

        with mock.patch.object(gemini, "generate_json", fake):
            try:
                out = gemini.generate_for(feature, "p", {})
            except Exception as exc:
                out = exc
        return out, calls

    def test_first_model_failing_uses_the_fallback(self):
        out, calls = self.run_with([RuntimeError("504"), {"ok": 1}])
        self.assertEqual(out, {"ok": 1})
        self.assertEqual([m for m, _ in calls], ["gemini-3.5-flash", "gemini-3.8-flash"])

    def test_first_try_gets_a_short_deadline_when_a_fallback_exists(self):
        _, calls = self.run_with([RuntimeError("504"), {"ok": 1}])
        self.assertEqual(calls[0][1], 10000)
        self.assertIsNone(calls[1][1])

    def test_success_on_first_model_makes_one_call(self):
        out, calls = self.run_with([{"ok": 1}])
        self.assertEqual(len(calls), 1)

    def test_both_failing_raises_the_last_error(self):
        out, calls = self.run_with([RuntimeError("a"), RuntimeError("b")])
        self.assertEqual(str(out), "b")

    def test_voice_falls_back_to_steady_when_lite_fails(self):
        out, calls = self.run_with([RuntimeError("429"), {"ok": 1}], feature="voice")
        self.assertEqual([m for m, _ in calls], ["gemini-3.5-flash-lite", "gemini-3.5-flash"])
        self.assertEqual(out, {"ok": 1})

    def test_empty_prompt_is_not_retried(self):
        out, calls = self.run_with([ValueError("prompt is empty")])
        self.assertIsInstance(out, ValueError)
        self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()

"""Scorer tests. No browser and no network.

    cd mcp && python -m unittest test_a11y.py
"""

import unittest

from a11y_checks import score
from a11y_collect import snapshot_from_html

CLEAN = """
<!doctype html>
<html lang="en">
<head>
  <title>Clean</title>
  <style>:focus-visible { outline: 3px solid #000; }</style>
</head>
<body>
  <main>
    <h1>Hello</h1>
    <p>A sentence.</p>
    <a href="/next">Next</a>
    <button type="button">Save</button>
    <img alt="A garden" src="g.jpg">
    <label>Name <input name="name"></label>
  </main>
</body>
</html>
"""

MISSING_ALT = """
<!doctype html>
<html lang="en">
<head><title>Alt</title><style>:focus { outline: 2px solid #000; }</style></head>
<body>
  <main>
    <h1>Picture</h1>
    <img src="plot.jpg">
  </main>
</body>
</html>
"""

DECORATIVE = """
<!doctype html>
<html lang="en">
<head><title>Tile</title><style>:focus-visible { outline: 3px solid blue; }</style></head>
<body>
  <main>
    <h1>Tiles</h1>
    <button type="button" aria-label="Coffee">
      <img alt="" src="coffee.jpg">
    </button>
  </main>
</body>
</html>
"""

AUDIO = """
<!doctype html>
<html lang="en">
<head><title>Listen</title><style>:focus-visible { outline: 3px solid #000; }</style></head>
<body>
  <main>
    <h1>Story</h1>
    <audio src="story.mp3" autoplay></audio>
  </main>
</body>
</html>
"""

UNLABELLED = """
<!doctype html>
<html lang="en">
<head><title>Ask</title><style>:focus-visible { outline: 3px solid #000; }</style></head>
<body>
  <main>
    <h1>Coach</h1>
    <input type="text" placeholder="Ask about Marcus">
    <button type="button">Ask</button>
  </main>
</body>
</html>
"""


AUDIO_WITH_WORDS = """
<!doctype html>
<html lang="en">
<head><title>Listen</title><style>:focus-visible { outline: 3px solid #000; }</style></head>
<body>
  <main>
    <h1>Story</h1>
    <div>
      <audio src="story.mp3" autoplay aria-describedby="said"></audio>
      <p id="said" data-transcript>I like Saturday bowling.</p>
      <button type="button">Play</button>
      <button type="button">Stop</button>
    </div>
  </main>
</body>
</html>
"""


class ScorerTests(unittest.TestCase):
    def test_clean_page_scores_100(self):
        report = score(snapshot_from_html(CLEAN, "https://example.test/"))
        self.assertEqual(report["ratio"], 100.0)
        self.assertEqual(report["findings"], [])
        self.assertIsNone(report["groups"]["transcripts"]["ratio"])
        self.assertIn("not a conformance claim", report["disclaimer"])

    def test_missing_alt_fails_alternatives(self):
        report = score(snapshot_from_html(MISSING_ALT))
        failed = [item for item in report["findings"] if item["group"] == "alternatives"]
        self.assertEqual(len(failed), 1)
        self.assertIn("no alt", failed[0]["summary"])
        self.assertEqual(report["groups"]["alternatives"]["ratio"], 0.0)

    def test_decorative_alt_inside_named_button_passes(self):
        report = score(snapshot_from_html(DECORATIVE))
        self.assertEqual(report["groups"]["alternatives"]["ratio"], 100.0)
        self.assertFalse(any(item["group"] == "alternatives" for item in report["findings"]))

    def test_audio_without_transcript_fails(self):
        report = score(snapshot_from_html(AUDIO))
        summaries = [item["summary"] for item in report["findings"] if item["group"] == "transcripts"]
        self.assertTrue(any("no transcript" in item for item in summaries))
        self.assertTrue(any("autoplays" in item for item in summaries))
        self.assertLess(report["groups"]["transcripts"]["ratio"], 100.0)

    def test_audio_with_transcript_and_stop_passes(self):
        report = score(snapshot_from_html(AUDIO_WITH_WORDS))
        self.assertEqual(report["groups"]["transcripts"]["ratio"], 100.0)

    def test_unlabelled_input_fails(self):
        report = score(snapshot_from_html(UNLABELLED))
        failed = [item for item in report["findings"] if "no label" in item["summary"]]
        self.assertEqual(len(failed), 1)
        self.assertIn("placeholder", failed[0]["fix"])

    def test_groups_share_weight(self):
        snapshot = snapshot_from_html(CLEAN)
        snapshot["contrast"] = [
            {"selector": "p", "text": "faint", "ratio": 2.0, "large": False},
        ]
        report = score(snapshot)
        # alternatives, keyboard, and understand are the applicable groups.
        # understand is 6 structural/name checks + 1 contrast = 6/7.
        understand = report["groups"]["understand"]
        self.assertEqual(understand["passed"], understand["applicable"] - 1)
        self.assertGreater(report["ratio"], understand["ratio"])


if __name__ == "__main__":
    unittest.main()

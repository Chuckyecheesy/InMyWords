import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts.shell_env import shell_exports


class ShellEnvTests(unittest.TestCase):
    def test_values_are_literal_and_whitespace_is_accepted(self):
        with tempfile.TemporaryDirectory() as tmp:
            marker = Path(tmp) / "executed"
            env = Path(tmp) / "test.env"
            env.write_text(
                "GEMINI_API_KEY=  example-key\n"
                f"LITERAL='$(touch {marker}); `echo bad` $HOME'\n"
                'WORDS="two words"\n'
                "REFERENCE=${GEMINI_API_KEY}\n"
            )
            script = shell_exports(str(env))
            result = subprocess.run(
                ["bash", "-c", script + '\nprintf "%s\\n" "$GEMINI_API_KEY" "$LITERAL" "$WORDS" "$REFERENCE"'],
                capture_output=True, text=True, check=True, env={"PATH": os.defpath},
            )
            self.assertEqual(result.stdout.splitlines(), [
                "example-key", f"$(touch {marker}); `echo bad` $HOME", "two words", "${GEMINI_API_KEY}"
            ])
            self.assertFalse(marker.exists())

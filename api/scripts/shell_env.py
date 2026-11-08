"""Emit shell-safe exports for deployment. Capture stdout; never log it."""
import re
import shlex
import sys

from dotenv import dotenv_values


def shell_exports(path: str) -> str:
    # Do not expand ${...}: credentials must remain literal strings.
    values = dotenv_values(path, interpolate=False)
    return "\n".join(
        f"export {key}={shlex.quote(value)}"
        for key, value in values.items()
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key) and value is not None
    )


if __name__ == "__main__":
    print(shell_exports(sys.argv[1]))

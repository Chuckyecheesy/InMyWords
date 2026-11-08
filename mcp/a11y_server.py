"""Accessibility ratio MCP server.

Run:  python mcp/a11y_server.py                 (streamable HTTP on :8105)
      python mcp/a11y_server.py --audit URL     (print a report, no server)
      python mcp/a11y_server.py --audit URL --out mcp/reports/page.json

Scores one page, or the exact URLs you pass. It does not crawl a site.
The ratio follows the W3C accessibility intro: alternative text, keyboard
access, transcripts, and the ability to perceive, understand, navigate,
and interact. It is not a WCAG conformance claim.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from fastmcp import FastMCP

from a11y_checks import aggregate, error_report, score
from a11y_collect import collect_url

mcp = FastMCP("accessibility")


def audit_url(url: str) -> dict:
    try:
        snapshot = collect_url(url)
    except Exception as exc:
        return error_report(url, str(exc))
    return score(snapshot)


@mcp.tool
def audit_page(url: str) -> dict:
    """Score one page against the W3C accessibility intro and return a ratio plus findings.

    The ratio is 0 to 100. Groups with nothing to check (for example a page
    with no audio) are left out. The report is not a conformance claim.
    """
    return audit_url(url)


@mcp.tool
def audit_pages(urls: list[str]) -> dict:
    """Score each URL and return those reports plus an equal-weight average ratio.

    Only the URLs you pass are opened. This does not follow links.
    """
    reports = [audit_url(url) for url in urls]
    return aggregate(reports)


def _write(report: dict, path: str) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    markdown = target.with_suffix(".md")
    markdown.write_text(report.get("markdown") or "", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Accessibility ratio MCP")
    parser.add_argument("--audit", nargs="+", metavar="URL", help="audit these URLs instead of serving")
    parser.add_argument("--out", help="write the JSON report here; a sibling .md is written too")
    args = parser.parse_args()
    if args.audit:
        report = audit_url(args.audit[0]) if len(args.audit) == 1 else aggregate(
            [audit_url(url) for url in args.audit]
        )
        text = report.get("markdown") or json.dumps(report, indent=2)
        print(text)
        if args.out:
            _write(report, args.out)
            print(f"wrote {args.out}")
        return
    mcp.run(transport="http", host="127.0.0.1", port=8105)


if __name__ == "__main__":
    main()

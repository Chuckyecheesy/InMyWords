"""Accessibility ratio for the checks taught on the W3C intro.

Source: https://www.w3.org/WAI/fundamentals/accessibility-intro/

The page says people must be able to perceive, understand, navigate, and
interact. Its three worked examples are alternative text, keyboard access,
and transcripts for audio. It names WCAG 2.2 as the international standard
(contrast numbers come from WCAG 2.2 AA) and states that no automated tool
can by itself decide conformance. Every report repeats that limit.

Groups have equal weight. Inside a group every applicable check has equal
weight. A check that does not apply is left out of that group's denominator,
and a group with no applicable checks is left out of the overall ratio.

    ratio = round(100 * mean(group passed / group applicable), 1)
"""

from __future__ import annotations

GUIDELINE_URL = "https://www.w3.org/WAI/fundamentals/accessibility-intro/"

DISCLAIMER = (
    "This ratio is an automated reading of the checks taught in the W3C "
    "introduction to web accessibility (alternative text, keyboard access, "
    "transcripts, and the related ability to perceive, understand, navigate, "
    "and interact, with WCAG 2.2 AA contrast numbers). W3C WAI states that no "
    "tool alone can determine whether a site meets accessibility guidelines. "
    "This report is not a conformance claim."
)

GROUP_ORDER = ("alternatives", "keyboard", "transcripts", "understand")

GROUP_TITLES = {
    "alternatives": "Alternatives (visual)",
    "keyboard": "Keyboard (physical)",
    "transcripts": "Transcripts (auditory)",
    "understand": "Understand and navigate",
}


def _check(group: str, selector: str, passed: bool, summary: str, fix: str) -> dict:
    return {
        "group": group,
        "selector": selector,
        "passed": passed,
        "summary": summary,
        "fix": fix,
    }


def _round1(value: float) -> float:
    return float(f"{value:.1f}")


def score(snapshot: dict) -> dict:
    """Turn a collected page snapshot into a ratio and a report."""
    checks: list[dict] = []
    checks.extend(_alternatives(snapshot.get("images") or []))
    checks.extend(_keyboard(snapshot))
    checks.extend(_transcripts(snapshot.get("media") or []))
    checks.extend(_understand(snapshot))

    groups: dict[str, dict] = {}
    for name in GROUP_ORDER:
        mine = [item for item in checks if item["group"] == name]
        applicable = len(mine)
        passed = sum(1 for item in mine if item["passed"])
        ratio = None if applicable == 0 else _round1(100 * passed / applicable)
        groups[name] = {
            "title": GROUP_TITLES[name],
            "passed": passed,
            "applicable": applicable,
            "ratio": ratio,
        }

    applicable_groups = [item for item in groups.values() if item["applicable"]]
    if applicable_groups:
        overall = _round1(
            sum(item["passed"] / item["applicable"] for item in applicable_groups)
            / len(applicable_groups)
            * 100
        )
    else:
        overall = 100.0

    findings = [item for item in checks if not item["passed"]]
    url = snapshot.get("url") or ""
    report = {
        "url": url,
        "guideline": GUIDELINE_URL,
        "ratio": overall,
        "groups": groups,
        "checks_passed": sum(1 for item in checks if item["passed"]),
        "checks_applicable": len(checks),
        "findings": findings,
        "truncated": {
            "contrast_capped": bool(snapshot.get("contrast_capped")),
        },
        "disclaimer": DISCLAIMER,
    }
    report["markdown"] = to_markdown(report)
    return report


def _alternatives(images: list[dict]) -> list[dict]:
    checks = []
    for image in images:
        selector = image.get("selector") or "img"
        has_alt = bool(image.get("has_alt"))
        alt = image.get("alt") or ""
        if not has_alt:
            checks.append(_check(
                "alternatives",
                selector,
                False,
                "Image has no alt attribute.",
                "Add alt text that says what the image is for, or alt=\"\" if the image is decorative.",
            ))
            continue
        if alt.strip():
            checks.append(_check(
                "alternatives",
                selector,
                True,
                "Image has alternative text.",
                "",
            ))
            continue
        if image.get("decorative"):
            checks.append(_check(
                "alternatives",
                selector,
                True,
                "Decorative image is hidden from the accessible name.",
                "",
            ))
            continue
        checks.append(_check(
            "alternatives",
            selector,
            False,
            "Image has empty alt text but is not marked decorative.",
            "Give the image equivalent alt text, or mark it decorative (alt=\"\" inside a named control, or aria-hidden=\"true\").",
        ))
    return checks


def _keyboard(snapshot: dict) -> list[dict]:
    checks = []
    focus_visible = snapshot.get("focus_visible")
    if focus_visible is not None:
        checks.append(_check(
            "keyboard",
            "page",
            bool(focus_visible),
            "A visible focus style is present." if focus_visible else "No visible focus style.",
            "" if focus_visible else "Add a :focus-visible outline or other visible focus indicator of at least 2px.",
        ))

    for control in snapshot.get("interactive") or []:
        selector = control.get("selector") or control.get("tag") or "control"
        tabindex = control.get("tabindex")
        if isinstance(tabindex, (int, float)) and tabindex > 0:
            checks.append(_check(
                "keyboard",
                selector,
                False,
                f"Positive tabindex ({int(tabindex)}) pulls this control out of the natural tab order.",
                "Remove the positive tabindex so the control follows the visual order.",
            ))
        if control.get("click_only"):
            checks.append(_check(
                "keyboard",
                selector,
                False,
                "This element has a click action and is not a keyboard control.",
                "Use a button or link, or add tabindex=\"0\" and a key handler that does the same thing.",
            ))
            continue
        if control.get("disabled"):
            continue
        in_order = bool(control.get("in_tab_order"))
        checks.append(_check(
            "keyboard",
            selector,
            in_order,
            "Control is in the tab order." if in_order else "Control is not in the tab order.",
            "" if in_order else "Remove tabindex=\"-1\" from this link, button, or input, or give it an equivalent keyboard control.",
        ))
    return checks


def _transcripts(media: list[dict]) -> list[dict]:
    checks = []
    for item in media:
        selector = item.get("selector") or item.get("tag") or "media"
        tag = item.get("tag") or "media"
        ok = bool(item.get("has_track") or item.get("has_transcript"))
        checks.append(_check(
            "transcripts",
            selector,
            ok,
            f"{tag} has a transcript or captions." if ok else f"{tag} has no transcript or captions.",
            "" if ok else "Add a caption or description track, or associate a text transcript with aria-describedby.",
        ))
        if item.get("autoplay"):
            can_stop = bool(item.get("has_pause"))
            checks.append(_check(
                "transcripts",
                selector,
                can_stop,
                "Autoplaying media has a pause or stop control." if can_stop else "Media autoplays with no pause or stop control.",
                "" if can_stop else "Add a pause or stop button next to the media, or do not autoplay it.",
            ))
    return checks


def _understand(snapshot: dict) -> list[dict]:
    checks = []
    lang = (snapshot.get("lang") or "").strip()
    checks.append(_check(
        "understand",
        "html",
        bool(lang),
        f"Page language is {lang}." if lang else "Page has no language.",
        "" if lang else "Set lang on the html element, for example lang=\"en\".",
    ))
    title = (snapshot.get("title") or "").strip()
    checks.append(_check(
        "understand",
        "title",
        bool(title),
        "Page has a title." if title else "Page has no title.",
        "" if title else "Add a title that names the page.",
    ))
    has_main = bool(snapshot.get("has_main"))
    checks.append(_check(
        "understand",
        "main",
        has_main,
        "Page has a main landmark." if has_main else "Page has no main landmark.",
        "" if has_main else "Wrap the primary content in a main element.",
    ))
    h1_count = int(snapshot.get("h1_count") or 0)
    one_h1 = h1_count == 1
    checks.append(_check(
        "understand",
        "h1",
        one_h1,
        "Page has one h1." if one_h1 else f"Page has {h1_count} h1 headings.",
        "" if one_h1 else "Keep a single h1 for the page title and use h2 for sections.",
    ))

    for control in snapshot.get("interactive") or []:
        selector = control.get("selector") or control.get("tag") or "control"
        if control.get("click_only"):
            continue
        name = (control.get("name") or "").strip()
        named = bool(name)
        checks.append(_check(
            "understand",
            selector,
            named,
            "Control has an accessible name." if named else "Control has no accessible name.",
            "" if named else "Add visible text, aria-label, or aria-labelledby so the name says what the control does.",
        ))
        if control.get("needs_label"):
            labelled = bool(control.get("labelled"))
            checks.append(_check(
                "understand",
                selector,
                labelled,
                "Input has a label." if labelled else "Input has no label.",
                "" if labelled else "Associate a label element, or set aria-label / aria-labelledby. A placeholder is not a label.",
            ))

    for sample in snapshot.get("contrast") or []:
        ratio = float(sample.get("ratio") or 0)
        large = bool(sample.get("large"))
        minimum = 3.0 if large else 4.5
        ok = ratio + 1e-9 >= minimum
        text = (sample.get("text") or "").strip()
        short = text if len(text) <= 42 else text[:39] + "..."
        checks.append(_check(
            "understand",
            sample.get("selector") or "text",
            ok,
            f"Contrast {ratio:.2f}:1 for \"{short}\"." if ok else f"Contrast {ratio:.2f}:1 is below {minimum:.1f}:1 for \"{short}\".",
            "" if ok else "Darken the text or lighten the background until it meets WCAG 2.2 AA (4.5:1, or 3:1 for large text).",
        ))
    return checks


def to_markdown(report: dict) -> str:
    lines = [
        "# Accessibility report",
        "",
        f"- URL: {report.get('url') or '(not set)'}",
        f"- Guideline: {report.get('guideline')}",
        f"- Ratio: {report.get('ratio')}",
        "",
        "## Groups",
        "",
    ]
    for name in GROUP_ORDER:
        group = report["groups"][name]
        if group["applicable"] == 0:
            lines.append(f"- {group['title']}: not applicable")
        else:
            lines.append(
                f"- {group['title']}: {group['ratio']} ({group['passed']}/{group['applicable']})"
            )
    findings = report.get("findings") or []
    lines.extend(["", "## Findings", ""])
    if not findings:
        lines.append("No failures in the applicable checks.")
    else:
        current = None
        for finding in findings:
            if finding["group"] != current:
                current = finding["group"]
                lines.extend(["", f"### {GROUP_TITLES[current]}", ""])
            lines.append(f"- `{finding['selector']}` — {finding['summary']} {finding['fix']}".rstrip())
    if report.get("truncated", {}).get("contrast_capped"):
        lines.extend([
            "",
            "Contrast was sampled from the first 80 visible text nodes. Later text was not scored.",
        ])
    lines.extend(["", "## Disclaimer", "", report.get("disclaimer") or DISCLAIMER, ""])
    return "\n".join(lines)


def aggregate(reports: list[dict]) -> dict:
    """Equal-weight average of page ratios. Pages that failed to load are listed and excluded."""
    scored = [item for item in reports if item.get("ratio") is not None and not item.get("error")]
    if scored:
        ratio = _round1(sum(item["ratio"] for item in scored) / len(scored))
    else:
        ratio = None
    return {
        "ratio": ratio,
        "pages": reports,
        "guideline": GUIDELINE_URL,
        "disclaimer": DISCLAIMER,
        "markdown": _aggregate_markdown(ratio, reports),
    }


def _aggregate_markdown(ratio, reports: list[dict]) -> str:
    lines = [
        "# Accessibility site report",
        "",
        f"- Ratio: {ratio if ratio is not None else 'n/a'}",
        f"- Guideline: {GUIDELINE_URL}",
        "",
        "## Pages",
        "",
    ]
    for report in reports:
        if report.get("error"):
            lines.append(f"- {report.get('url')}: error — {report['error']}")
        else:
            lines.append(f"- {report.get('url')}: {report.get('ratio')}")
    lines.extend(["", "## Disclaimer", "", DISCLAIMER, ""])
    return "\n".join(lines)


def error_report(url: str, message: str) -> dict:
    report = {
        "url": url,
        "guideline": GUIDELINE_URL,
        "ratio": None,
        "error": message,
        "groups": {
            name: {"title": GROUP_TITLES[name], "passed": 0, "applicable": 0, "ratio": None}
            for name in GROUP_ORDER
        },
        "checks_passed": 0,
        "checks_applicable": 0,
        "findings": [],
        "truncated": {},
        "disclaimer": DISCLAIMER,
    }
    report["markdown"] = f"# Accessibility report\n\n- URL: {url}\n- Error: {message}\n\n## Disclaimer\n\n{DISCLAIMER}\n"
    return report

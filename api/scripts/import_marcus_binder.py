#!/usr/bin/env python3
"""Import Marcus's binder into the memory store (T4.2).

Uses Gemini when GEMINI_API_KEY is set; otherwise a quote-locked deterministic
extract so the demo still lands 'From records, 2021' facts.

Usage (from repo root):
    api/.venv/bin/python api/scripts/import_marcus_binder.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
API = ROOT / "api"
MCP = ROOT / "mcp"
sys.path.insert(0, str(API))
sys.path.insert(0, str(MCP))

from agents.memory.binder import import_binder  # noqa: E402
from agents.memory.marcus_extract import marcus_binder_extract  # noqa: E402
from store import get_store, source_label  # noqa: E402


def load_env() -> None:
    path = ROOT / ".env"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#") or "=" not in trimmed:
            continue
        key, _, value = trimmed.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def make_extract():
    if os.environ.get("GEMINI_API_KEY"):
        try:
            from services import gemini

            def extract(prompt: str):
                return gemini.generate_json(
                    prompt,
                    schema_name="document_facts",
                )

            print("Extract: Gemini document_facts")
            return extract
        except Exception as exc:
            print(f"Gemini unavailable ({exc}); using quote-locked extract.")
    print("Extract: quote-locked Marcus binder facts")
    return marcus_binder_extract


def make_remember(store):
    def remember(**record):
        return store.remember(
            record["resident_id"],
            record["type"],
            record["content"],
            record["source"],
            source_date=record.get("source_date"),
        )

    return remember


def main() -> int:
    load_env()
    binder = (ROOT / "db" / "seed" / "marcus_binder.md").read_text(encoding="utf-8")
    store = get_store()
    saved = import_binder(
        binder,
        resident_id="marcus",
        extract=make_extract(),
        remember=make_remember(store),
    )
    print(f"Saved {len(saved)} binder facts via {store.mode} store:")
    ok = True
    for fact in saved:
        label = source_label(fact["source"], "Marcus", fact["source_date"])
        print(f"  [{label}] {fact['content']}")
        if fact["source"] != "document" or not str(fact["source_date"]).startswith("2021"):
            ok = False
        if not label.startswith("From records"):
            ok = False
    if not saved:
        print("No facts saved.", file=sys.stderr)
        return 1
    if not ok:
        print("Verification failed: expected document + From records + 2021.", file=sys.stderr)
        return 1
    print(json.dumps({"ok": True, "count": len(saved), "label_example":
                      source_label("document", "Marcus", "2021-03-15")}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

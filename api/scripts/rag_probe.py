"""Live check of memory RAG ranking against the seed data (needs GEMINI_API_KEY).

    api/.venv/bin/python api/scripts/rag_probe.py
    api/.venv/bin/python api/scripts/rag_probe.py "what calms him down"

Prints the top raw scores and what retrieval keeps. Use it to re-check
RAG_MIN_SCORE / RAG_MARGIN after changing the embedding model or seed facts:
answerable questions should keep their facts, unanswerable ones keep nothing.
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "mcp"))

import retrieval  # noqa: E402
import store  # noqa: E402

DEFAULT = [
    ("marcus", "What does Marcus like to drink?", True),
    ("marcus", "What helps Marcus when he is upset?", True),
    ("marcus", "How do I talk to Marcus?", True),
    ("marcus", "who is his sister", True),
    ("marcus", "When is pickup for day program?", True),
    ("marcus", "does Marcus have a pet dog", False),
    ("marcus", "what's Marcus's favourite colour", False),
    ("dana", "Does Dana garden?", True),
]


def main():
    store._load_env()
    os.environ["DATABASE_URL"] = ""
    if not os.environ.get("GEMINI_API_KEY"):
        sys.exit("GEMINI_API_KEY not set; this probe checks live embeddings.")
    s = store.SeedStore()
    original = retrieval.select

    def spy(rows, limit, broad=False):
        for r in sorted(rows, key=lambda r: -(r["sim"] or 0))[:4]:
            print(f"    sim={r['sim'] or 0:.3f} kw={r['kw']}  {r['row']['content'][:60]}")
        return original(rows, limit, broad)

    store.select = spy
    cases = [("marcus", q, None) for q in sys.argv[1:]] or DEFAULT
    bad = 0
    for rid, q, answerable in cases:
        print(f"\n{q!r}")
        kept = s.search_facts(rid, q)
        print("  KEPT:", [f["content"][:45] for f in kept] or "nothing -> Coach says ask them")
        if answerable is not None and bool(kept) != answerable:
            bad += 1
            print("  !! expected", "a fact" if answerable else "nothing")
    print(f"\nmin_score={retrieval.MIN_SCORE} margin={retrieval.MARGIN} mismatches={bad}")


if __name__ == "__main__":
    main()

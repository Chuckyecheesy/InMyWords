"""memory MCP server (BUILD_PLAN T2.5) — 5 tools.

Run:  python mcp/memory_server.py          (streamable HTTP on :8102)

Confirmed memories ARE the profile. Everything inferred stays "pattern
noticed" (pending) until the resident confirms it — then it becomes
"in <name>'s words" (source flips to resident). recall ranks by keyword
+ recency now; vector similarity joins the ranking once embeddings are
backfilled (after Ahmed's T3.1) with no shape change.
"""

from fastmcp import FastMCP

from store import get_store, source_label

mcp = FastMCP("memory")


def _label_source(m):
    """Pending inferred facts read as 'Pattern noticed'.
    Binder/document facts keep 'From records' even while pending confirmation."""
    if m["status"] == "pending" and m["source"] in ("inferred", "pattern"):
        return "inferred"
    return m["source"]


def _fact(m, name):
    date = m.get("source_date") or str(m["last_seen"])[:10]
    return {
        "id": m["id"],
        "type": m["type"],
        "content": m["content"],
        "source": m["source"],
        "date": str(date),
        "times_seen": m["times_seen"],
        "status": m["status"],
        "label": source_label(_label_source(m), name, str(date)),
        "update_reason": m.get("update_reason"),
    }


def _name(store, resident):
    r = store.get_resident(resident)
    return r["first_name"] if r else resident


@mcp.tool
def remember(resident: str, event: str, source: str = "inferred",
             type: str = "event", source_date: str = "") -> dict:
    """Save a candidate memory (type: preference | event | routine).
    Near-duplicates bump times_seen instead of creating a copy. New
    memories start PENDING — only the resident can confirm them.
    source_date is required for document facts (the binder's own date)."""
    if source not in ("resident", "staff", "emh", "document", "inferred"):
        return {"error": f"invalid source '{source}'"}
    if type not in ("preference", "event", "routine"):
        return {"error": f"invalid type '{type}'"}
    if source == "document" and not source_date:
        return {"error": "document facts need source_date (the binder's date)"}
    store = get_store()
    result = store.remember(
        resident, type, event, source, source_date=source_date or None)
    return dict(result, store_mode=store.mode)


@mcp.tool
def recall(resident: str, query: str, type: str = "") -> dict:
    """Matching memories with source and confirmation status, best first.
    type filters to preference | event | routine; empty = all."""
    store = get_store()
    name = _name(store, resident)
    memories = store.recall(resident, query, type or None)
    return {"resident": resident, "query": query,
            "memories": [_fact(m, name) for m in memories],
            "store_mode": store.mode}


@mcp.tool
def get_routines(resident: str) -> dict:
    """Confirmed and suggested (pending, 'pattern noticed') routines."""
    store = get_store()
    name = _name(store, resident)
    confirmed, suggested = store.get_routines(resident)
    return {"resident": resident,
            "confirmed": [_fact(m, name) for m in confirmed],
            "suggested": [_fact(m, name) for m in suggested],
            "store_mode": store.mode}


@mcp.tool
def get_pending(resident: str) -> dict:
    """The resident's 'confirm?' queue — everything waiting for their yes/no.
    (Additive tool beyond the 5 in the contract; the UI needs it.)"""
    store = get_store()
    name = _name(store, resident)
    return {"resident": resident,
            "memories": [_fact(m, name) for m in store.get_pending(resident)],
            "store_mode": store.mode}


@mcp.tool
def get_recent_changes(resident: str, since: str = "") -> dict:
    """Memories the resident confirmed (now 'in their words'), optionally
    since an ISO timestamp. (Additive — Handoff mentions these changes.)"""
    store = get_store()
    name = _name(store, resident)
    rows = store.get_recent_confirmed(resident, since or None)
    return {"resident": resident, "memories": [_fact(m, name) for m in rows]}


@mcp.tool
def propose_update(resident: str, memory: int, reason: str) -> dict:
    """Flag an existing memory for the resident's 'confirm?' queue (e.g. the
    Consolidator noticed current behaviour contradicts it). Never overwrites —
    the resident decides."""
    store = get_store()
    row = store.propose_update(resident, memory, reason)
    if not row:
        return {"error": f"no memory {memory} for '{resident}'"}
    return {"queued": _fact(row, _name(store, resident)), "store_mode": store.mode}


@mcp.tool
def confirm_memory(resident: str, memory: int, confirmed: bool) -> dict:
    """Resident's answer to 'is this true?'. Yes → confirmed and the fact
    becomes 'in <name>'s words'. No → dismissed."""
    store = get_store()
    row = store.confirm_memory(resident, memory, confirmed)
    if not row:
        return {"error": f"no memory {memory} for '{resident}'"}
    return {"memory": _fact(row, _name(store, resident)),
            "now": "confirmed — in the resident's words" if confirmed else "dismissed",
            "store_mode": store.mode}


@mcp.tool
def log_input_event(event: dict) -> dict:
    """Save one gaze/gesture/touch OUTCOME event (GAZE_GESTURE_PLAN §7).
    Fields: ts, resident_id, session_id, input_type (touch|gaze|gesture),
    action (select|approve|cancel|custom), target, hold_ms, gesture,
    confidence, outcome (confirmed|cancelled|timeout). Never video, never
    raw gaze samples."""
    store = get_store()
    saved = store.log_input_events([event])
    return {"ok": True, "saved": saved, "store_mode": store.mode}


@mcp.tool
def log_input_events(events: list[dict]) -> dict:
    """Batch version of log_input_event — what POST /input-events uses
    (the frontend queue flushes every 2 s)."""
    store = get_store()
    saved = store.log_input_events(events)
    return {"ok": True, "saved": saved, "store_mode": store.mode}


@mcp.tool
def get_input_profile(resident: str) -> dict:
    """How this resident communicates best, learned from input history
    (last 14 days): preferred select method, preferred yes, dwell_ms,
    confirmed rates, time-of-day notes, confidence. Plain arithmetic.
    Labelled 'from input history' — never the resident's own words."""
    store = get_store()
    return dict(store.get_input_profile(resident), store_mode=store.mode)


if __name__ == "__main__":
    mcp.run(transport="http", host="127.0.0.1", port=8102)

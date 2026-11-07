"""emh MCP server (mock) — BUILD_PLAN T2.4. 3 tools.

Run:  python mcp/emh_server.py          (streamable HTTP on :8104)

Pitch point: swap this mock for a real EMH connection and no agent code
changes — the tools and shapes stay identical.
"""

from fastmcp import FastMCP

from store import get_store

mcp = FastMCP("emh")


@mcp.tool
def get_contact_notes(resident: str, since: str = "") -> dict:
    """EMH contact notes for a resident, optionally since an ISO timestamp."""
    store = get_store()
    notes = store.get_emh_notes(resident, since or None)
    return {"resident": resident,
            "notes": [{"author": n["author"], "note": n["note"], "date": str(n["created_at"])[:10]}
                      for n in notes]}


@mcp.tool
def get_checklist(home: str, date: str = "") -> dict:
    """Home checklist items: happened / didn't happen / why."""
    store = get_store()
    rows = store.get_emh_checklist(home, date or None)
    return {"home": home,
            "items": [{"date": str(c["date"]), "item": c["item"],
                       "happened": c["happened"], "reason": c["reason"]}
                      for c in rows]}


@mcp.tool
def get_significant_events(resident: str) -> dict:
    """Significant events with dates."""
    store = get_store()
    events = store.get_emh_events(resident)
    return {"resident": resident,
            "events": [{"event": e["event"], "date": str(e["created_at"])[:10]} for e in events]}


if __name__ == "__main__":
    mcp.run(transport="http", host="127.0.0.1", port=8104)

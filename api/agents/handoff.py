"""Handoff agent (BUILD_PLAN T2.7), "since your last shift" summary.

Gathers through the MCP servers only (never the database): EMH notes,
checklist misses with reasons, observations, choices, open staff tasks,
and memories the resident confirmed. Facts only, every bullet keeps its
date, no guessed causes.

Phrasing: plain code builds correct bullets; if GEMINI_API_KEY is set we
let Gemini smooth the wording (facts and dates pass through), and fall
back to the plain bullets on any error, the demo never blocks on an LLM.
"""

from services import mcp_client


async def build_handoff(staff_id: str, resident_id: str) -> dict:
    staff = await mcp_client.get_staff(staff_id)
    since = staff.get("last_shift_end") or ""  # new staff -> everything

    profile = await mcp_client.get_profile(resident_id)
    name = profile.get("name", resident_id.capitalize())
    home = "maple_house" if resident_id == "marcus" else "birch_house"
    # TODO: home comes from get_profile once residents carry home_id through

    notes = await mcp_client.get_contact_notes(resident_id, since)
    checklist = await mcp_client.get_checklist(home)
    observations = await mcp_client.get_observations(resident_id, since)
    choices = await mcp_client.get_choices(resident_id, since)
    tasks = await mcp_client.get_staff_tasks(resident_id)
    changes = await mcp_client.get_recent_changes(resident_id, since)

    items = []
    for t in tasks["tasks"]:
        if t["status"] == "open":
            due = f", due {str(t['due'])[:16].replace('T', ' ')}" if t["due"] else ""
            items.append({"type": "staff_task", "date": "open", "text": f"{t['task']}{due}"})
    for c in choices["choices"]:
        what = c["chosen"] if c["status"] == "chosen" else "not decided yet"
        items.append({"type": "choice", "date": c["date"],
                      "text": f"{name} chose: {what}" if c["status"] == "chosen"
                              else f"A choice is still open ({what})"})
    for row in checklist["items"]:
        if not row["happened"] and (not since or str(row["date"]) >= since[:10]):
            items.append({"type": "emh_checklist", "date": row["date"],
                          "text": f"{row['item']} didn't happen, {row['reason']}"})
    for m in changes["memories"]:
        items.append({"type": "memory", "date": m["date"],
                      "text": f"Confirmed by {name}: {m['content']} (now in {name}'s words)"})
    for o in observations["observations"]:
        items.append({"type": "observation", "date": o["date"], "text": o["note"]})
    for n in notes["notes"][:4]:
        items.append({"type": "emh_note", "date": n["date"], "text": n["note"]})

    items = _maybe_polish(items, name)
    return {"staff": staff.get("name", staff_id), "resident": name,
            "since": since or "first shift, showing everything", "items": items}


def _maybe_polish(items, name):
    """Optional Gemini pass for smoother wording. Facts and dates are the
    input and must survive; any failure returns the plain bullets.
    OFF by default: measured ~30s on live Gemini, and handoff must load
    fast at shift start. Set HANDOFF_POLISH=1 to enable."""
    import os
    if os.environ.get("HANDOFF_POLISH") != "1":
        return items
    if not os.environ.get("GEMINI_API_KEY") or not items:
        return items
    try:
        from services.gemini import SCHEMAS, generate_for
        prompt = (
            f"Rewrite these shift-handoff items about {name} as short plain bullets "
            f"for support staff. Facts only. Keep every date exactly. Never guess causes. "
            f"Keep the type of each item.\n\n"
            + "\n".join(f"- [{i['type']} | {i['date']}] {i['text']}" for i in items))
        result = generate_for("handoff", prompt, SCHEMAS["handoff"]["items"])
        polished = result.get("items") if isinstance(result, dict) else None
        if polished and len(polished) == len(items):
            return polished
    except Exception as exc:
        print(f"[handoff] Gemini polish skipped: {type(exc).__name__}: {exc}")
    return items

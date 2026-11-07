"""One function per MCP tool (BUILD_PLAN T2.3) — the only way routes and
agents reach data. Reads server URLs from the environment (.env):

    MCP_PROFILE_URL  default http://127.0.0.1:8101/mcp
    MCP_EMH_URL      default http://127.0.0.1:8104/mcp
    (memory :8102 and actions :8103 land in T2.5/T2.6)
"""

import json
import os

from fastmcp import Client

_DEFAULTS = {
    "profile": "http://127.0.0.1:8101/mcp",
    "memory": "http://127.0.0.1:8102/mcp",
    "actions": "http://127.0.0.1:8103/mcp",
    "emh": "http://127.0.0.1:8104/mcp",
}


def _url(name: str) -> str:
    url = os.environ.get(f"MCP_{name.upper()}_URL", _DEFAULTS[name])
    return url if url.rstrip("/").endswith("/mcp") else url.rstrip("/") + "/mcp"


async def _call(server: str, tool: str, args: dict):
    async with Client(_url(server)) as client:
        result = await client.call_tool(tool, args)
        data = getattr(result, "data", None)
        if data is not None:
            return data
        # fallback for older client versions: parse first text content block
        content = getattr(result, "content", result)
        text = content[0].text if content else "{}"
        return json.loads(text)


# ---- resident-profile server ----

async def get_profile(resident):
    return await _call("profile", "get_profile", {"resident": resident})

async def get_story(resident):
    return await _call("profile", "get_story", {"resident": resident})

async def save_story_chapter(resident, chapter, text, photos=None):
    return await _call("profile", "save_story_chapter",
                       {"resident": resident, "chapter": chapter, "text": text, "photos": photos or []})

async def ask_about(resident, question):
    return await _call("profile", "ask_about", {"resident": resident, "question": question})

async def suggest_sentence(resident, tiles, time_of_day=""):
    return await _call("profile", "suggest_sentence",
                       {"resident": resident, "tiles": tiles, "time_of_day": time_of_day})

async def log_sentence(resident, sentence, approved, tiles=None):
    return await _call("profile", "log_sentence",
                       {"resident": resident, "sentence": sentence, "approved": approved, "tiles": tiles or []})

async def log_choice(resident, options, chosen=None, question=""):
    return await _call("profile", "log_choice",
                       {"resident": resident, "options": options, "chosen": chosen, "question": question})

async def add_observation(resident, staff, note):
    return await _call("profile", "add_observation",
                       {"resident": resident, "staff": staff, "note": note})


# ---- memory server ----

async def remember(resident, event, source="inferred", mem_type="event"):
    return await _call("memory", "remember",
                       {"resident": resident, "event": event, "source": source, "type": mem_type})

async def recall(resident, query, mem_type=""):
    return await _call("memory", "recall", {"resident": resident, "query": query, "type": mem_type})

async def get_routines(resident):
    return await _call("memory", "get_routines", {"resident": resident})

async def get_pending_memories(resident):
    return await _call("memory", "get_pending", {"resident": resident})

async def propose_update(resident, memory_id, reason):
    return await _call("memory", "propose_update",
                       {"resident": resident, "memory": memory_id, "reason": reason})

async def confirm_memory(resident, memory_id, confirmed):
    return await _call("memory", "confirm_memory",
                       {"resident": resident, "memory": memory_id, "confirmed": confirmed})


# ---- actions server ----

async def plan_actions(resident, goal):
    return await _call("actions", "plan_actions", {"resident": resident, "goal": goal})

async def approve_plan(resident, plan_id):
    return await _call("actions", "approve_plan", {"resident": resident, "plan_id": plan_id})

async def cancel_plan(resident, plan_id):
    return await _call("actions", "cancel_plan", {"resident": resident, "plan_id": plan_id})

async def create_staff_task(resident, task, time=""):
    return await _call("actions", "create_staff_task",
                       {"resident": resident, "task": task, "time": time})

async def get_activity(resident):
    return await _call("actions", "get_activity", {"resident": resident})


# ---- emh server (mock) ----

async def get_contact_notes(resident, since=""):
    return await _call("emh", "get_contact_notes", {"resident": resident, "since": since})

async def get_checklist(home, date=""):
    return await _call("emh", "get_checklist", {"home": home, "date": date})

async def get_significant_events(resident):
    return await _call("emh", "get_significant_events", {"resident": resident})

"""One function per MCP tool (BUILD_PLAN T2.3) — the only way routes and
agents reach data. Reads server URLs from the environment (.env):

    MCP_PROFILE_URL  default http://127.0.0.1:8101/mcp
    MCP_EMH_URL      default http://127.0.0.1:8104/mcp
    MCP_MEMORY_URL   default http://127.0.0.1:8102/mcp
    MCP_ACTIONS_URL  default http://127.0.0.1:8103/mcp

Sessions are kept open and reused (see _session); a broken one is dropped and
reopened on the next call.
"""

import asyncio
import json
import os
import weakref

import httpx
from fastmcp import Client
from fastmcp.exceptions import ToolError

_DEFAULTS = {
    "profile": "http://127.0.0.1:8101/mcp",
    "memory": "http://127.0.0.1:8102/mcp",
    "actions": "http://127.0.0.1:8103/mcp",
    "emh": "http://127.0.0.1:8104/mcp",
}


def _url(name: str) -> str:
    url = os.environ.get(f"MCP_{name.upper()}_URL", _DEFAULTS[name])
    return url if url.rstrip("/").endswith("/mcp") else url.rstrip("/") + "/mcp"


# One open MCP session per server, reused by every call. Opening a session per
# call (connect + initialize) cost ~300 ms of the ~500 ms each call took.
# Per event loop: a session belongs to the loop that opened it (uvicorn has one;
# tests and scripts may run several). Weak keys, so a closed loop's sessions go away.
_per_loop: "weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, dict]" = weakref.WeakKeyDictionary()


def _loop_state() -> dict:
    loop = asyncio.get_running_loop()
    state = _per_loop.get(loop)
    if state is None:
        state = _per_loop[loop] = {
            "sessions": {},
            "lock": asyncio.Lock(),
            # One call at a time per server. The streamable session is one
            # connection; overlapping calls mix their replies and the route
            # then 500s. Opening Marcus fires several of these at once.
            "calls": {},
        }
    return state


async def _session(server: str) -> Client:
    state = _loop_state()
    client = state["sessions"].get(server)
    if client is not None and client.is_connected():
        return client
    async with state["lock"]:
        client = state["sessions"].get(server)
        if client is not None and client.is_connected():
            return client
        await _drop(server)
        client = Client(_url(server))
        await client.__aenter__()
        state["sessions"][server] = client
        return client


async def _drop(server: str) -> None:
    client = _loop_state()["sessions"].pop(server, None)
    if client is not None:
        try:
            await client.__aexit__(None, None, None)
        except Exception:
            pass


def _unpack(result):
    data = getattr(result, "data", None)
    if data is not None:
        return data
    # fallback for older client versions: parse first text content block
    content = getattr(result, "content", result)
    text = content[0].text if content else "{}"
    return json.loads(text)


def _call_lock(server: str) -> asyncio.Lock:
    state = _loop_state()
    lock = state["calls"].get(server)
    if lock is None:
        lock = state["calls"][server] = asyncio.Lock()
    return lock


async def _call(server: str, tool: str, args: dict):
    async with _call_lock(server):
        return await _call_locked(server, tool, args)


async def _call_locked(server: str, tool: str, args: dict):
    try:
        client = await _session(server)
    except Exception:
        await _drop(server)
        raise  # server down: the route falls back to mock JSON
    try:
        return _unpack(await client.call_tool(tool, args))
    except ToolError:
        raise  # the tool ran and failed; the session is fine
    except httpx.ConnectError:
        # The request never reached the server (it restarted): reconnect and
        # retry once. Safe for writes, because nothing ran the first time.
        await _drop(server)
        client = await _session(server)
        return _unpack(await client.call_tool(tool, args))
    except Exception:
        # Anything else may have happened after the tool ran, so never retry
        # (a write could run twice). Drop the session; the next call reconnects.
        await _drop(server)
        raise


# ---- resident-profile server ----

async def get_profile(resident):
    return await _call("profile", "get_profile", {"resident": resident})

async def save_tile(resident, label, cloudinary_id, category=""):
    return await _call("profile", "save_tile", {"resident": resident, "label": label,
                                                "cloudinary_id": cloudinary_id, "category": category or ""})

async def get_story(resident):
    return await _call("profile", "get_story", {"resident": resident})

async def save_story_answer(resident, chapter, question, answer):
    return await _call("profile", "save_story_answer",
                       {"resident": resident, "chapter": chapter, "question": question, "answer": answer})

async def get_story_answers(resident, chapter=""):
    return await _call("profile", "get_story_answers",
                       {"resident": resident, "chapter": chapter})

async def get_story_chapter(chapter_id):
    return await _call("profile", "get_story_chapter", {"chapter_id": int(chapter_id)})

async def approve_story_chapter(chapter_id, audio_url):
    return await _call("profile", "approve_story_chapter",
                       {"chapter_id": int(chapter_id), "audio_url": audio_url})

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

async def get_observations(resident, since=""):
    return await _call("profile", "get_observations", {"resident": resident, "since": since})

async def get_choices(resident, since=""):
    return await _call("profile", "get_choices", {"resident": resident, "since": since})


# ---- memory server ----

async def remember(resident, event, source="inferred", mem_type="event", source_date=None):
    payload = {"resident": resident, "event": event, "source": source, "type": mem_type}
    if source_date:
        payload["source_date"] = source_date
    return await _call("memory", "remember", payload)

async def recall(resident, query, mem_type="", broad=False):
    args = {"resident": resident, "query": query, "type": mem_type}
    if broad:  # additive arg; omitted by default so the contract call is unchanged
        args["broad"] = True
    return await _call("memory", "recall", args)

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

async def log_input_events(events):
    return await _call("memory", "log_input_events", {"events": events})

async def get_input_profile(resident):
    return await _call("memory", "get_input_profile", {"resident": resident})

async def save_custom_gesture(resident, tile, samples):
    return await _call("memory", "save_custom_gesture",
                       {"resident": resident, "tile": tile, "samples": samples})

async def get_custom_gestures(resident):
    return await _call("memory", "get_custom_gestures", {"resident": resident})


# ---- actions server ----

async def plan_actions(resident, goal):
    return await _call("actions", "plan_actions", {"resident": resident, "goal": goal})

async def save_plan(resident, goal, steps):
    return await _call("actions", "save_plan", {"resident": resident, "goal": goal, "steps": steps})

async def approve_plan(resident, plan_id):
    return await _call("actions", "approve_plan", {"resident": resident, "plan_id": plan_id})

async def cancel_plan(resident, plan_id):
    return await _call("actions", "cancel_plan", {"resident": resident, "plan_id": plan_id})

async def create_staff_task(resident, task, time=""):
    return await _call("actions", "create_staff_task",
                       {"resident": resident, "task": task, "time": time})

async def get_activity(resident):
    return await _call("actions", "get_activity", {"resident": resident})

async def get_staff_tasks(resident=""):
    return await _call("actions", "get_staff_tasks", {"resident": resident})

async def get_recent_changes(resident, since=""):
    return await _call("memory", "get_recent_changes", {"resident": resident, "since": since})

async def get_staff(staff):
    return await _call("emh", "get_staff", {"staff": staff})


# ---- emh server (mock) ----

async def get_contact_notes(resident, since=""):
    return await _call("emh", "get_contact_notes", {"resident": resident, "since": since})

async def get_checklist(home, date=""):
    return await _call("emh", "get_checklist", {"home": home, "date": date})

async def get_significant_events(resident):
    return await _call("emh", "get_significant_events", {"resident": resident})

"""T1.6: create or update the ElevenLabs "Onboarding Coach" voice agent.

Run from api/ (needs ELEVENLABS_API_KEY with ElevenLabs Agents: Write):

    python -m scripts.create_coach_agent            # create, or update if the ID is already in .env
    python -m scripts.create_coach_agent --print    # show the config, change nothing

Prints the agent ID for ELEVENLABS_COACH_AGENT_ID.

Staff talk to it out loud (Coach voice mode). The screen starts a conversation
with the dynamic variables resident_id and resident_name.

Tool:
  ask_about   webhook: POST {API}/coach/ask {resident_id, question}
              -> {answer, sources: [{type, date, label}]}. resident_id comes
              from the session variables, not from the model.

Rules in the prompt: answer only from the tool, always say where a fact came
from, say "I don't know, it's best to ask <name>" when the tool has nothing,
never present a pattern or record as the resident's own words.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys

from scripts.create_story_agent import _string, api_base
from services import elevenlabs

NAME = "In My Words – Onboarding Coach"
# A neutral, clear stock voice for staff. Different from the Story Interviewer.
VOICE_ID = os.environ.get("ELEVENLABS_COACH_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")
LLM = os.environ.get("ELEVENLABS_COACH_LLM", "gemini-2.5-flash")

PROMPT = """You are the Onboarding Coach for In My Words. You help support staff get to know {{resident_name}}, an adult who lives in a supported living home and may not speak. Staff ask you questions out loud. You answer out loud.

Rules:
- For every question about {{resident_name}}, call ask_about with the staff member's question. Never answer from your own knowledge, and never guess.
- Answer in one to three short spoken sentences, using only what ask_about returned.
- Always say where the answer came from, using each source's type:
  - resident: "{{resident_name}} told us..." or "In {{resident_name}}'s words..."
  - staff: "A staff note from <date> says..."
  - emh: "The EMH record says..."
  - document: "Older records from <year> say..." Add that it may be out of date.
  - pattern or inferred: "We've noticed a pattern, but {{resident_name}} hasn't confirmed it..."
  Say dates the natural way, for example "March 3rd", not "2026-03-03".
- Never present a record, staff note or pattern as {{resident_name}}'s own words.
- If ask_about returns no sources, or says it does not know, say: "I don't know. It's best to ask {{resident_name}}." Do not fill the gap.
- Decisions belong to {{resident_name}}. Never tell staff to decide for them. If asked what {{resident_name}} should do, say staff can offer choices and support {{resident_name}} to decide.
- Do not give medical advice. For health questions, share only what the records say, then point staff to the care plan and their supervisor.
- Speak like a calm colleague: warm, unhurried, and natural. Short sentences. Not like a recording.
- Never use an em dash, an en dash, or a double hyphen. Use a period or a comma.
- If a tool fails, say "Sorry, I couldn't check that. Please try again." """

FIRST_MESSAGE = "Hi, I'm the onboarding coach. Ask me anything about {{resident_name}}, and I'll tell you what we know and where it came from."

PLACEHOLDERS = {"resident_id": "marcus", "resident_name": "Marcus"}


def tools(api: str) -> list[dict]:
    return [
        {
            "type": "webhook",
            "name": "ask_about",
            "description": "Look up what is known about the resident. Returns an answer and its sources "
                           "(type, date, label). Call it for every question about the resident.",
            "api_schema": {
                "url": f"{api}/coach/ask",
                "method": "POST",
                "request_body_schema": {
                    "type": "object",
                    "properties": {
                        "resident_id": {"type": "string", "dynamic_variable": "resident_id"},
                        "question": _string("The staff member's question, in plain words."),
                    },
                    "required": ["resident_id", "question"],
                },
            },
        },
    ]


def config(api: str) -> dict:
    return {
        "name": NAME,
        "tags": ["inmywords", "coach"],
        "conversation_config": {
            "agent": {
                "first_message": FIRST_MESSAGE,
                "language": "en",
                "dynamic_variables": {"dynamic_variable_placeholders": PLACEHOLDERS},
                "prompt": {"prompt": PROMPT, "llm": LLM, "temperature": 0.2, "tools": tools(api)},
            },
            "tts": {"voice_id": VOICE_ID, **elevenlabs.AGENT_TTS},
            "conversation": {"max_duration_seconds": 1800},
        },
    }


async def main(print_only: bool) -> None:
    api = api_base()
    body = config(api)
    if print_only:
        print(json.dumps(body, indent=2))
        return
    if not elevenlabs.configured():
        sys.exit("ELEVENLABS_API_KEY is not set. Add it to the repo-root .env first.")

    client, headers = elevenlabs._client(), elevenlabs._headers()
    existing = os.environ.get("ELEVENLABS_COACH_AGENT_ID")
    if existing:
        resp = await client.patch(f"/convai/agents/{existing}", headers=headers, json=body, timeout=60)
        elevenlabs._raise_for(resp, "update coach agent")
        print(f"Updated {NAME}: {existing}")
        agent_id = existing
    else:
        resp = await client.post("/convai/agents/create", headers=headers, json=body, timeout=60)
        elevenlabs._raise_for(resp, "create coach agent")
        agent_id = resp.json()["agent_id"]
        print(f"Created {NAME}: {agent_id}")
    print(f"Webhook calls {api}/coach/ask")
    print(f"ELEVENLABS_COACH_AGENT_ID={agent_id}")


if __name__ == "__main__":
    asyncio.run(main("--print" in sys.argv))

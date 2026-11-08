"""T1.4: create or update the ElevenLabs "Story Interviewer" agent.

Run from api/ (needs ELEVENLABS_API_KEY in the repo-root .env):

    python -m scripts.create_story_agent            # create, or update if the ID is already in .env
    python -m scripts.create_story_agent --print    # show the config, change nothing

Prints the agent ID for ELEVENLABS_STORY_AGENT_ID.

How a session works (the interview screen starts it):
  The screen starts a conversation with these dynamic variables:
    resident_id, resident_name, chapter (chapter_key), chapter_title,
    chapter_questions (one line per question: "Question? [Option A | Option B]")
  The questions live in web/lib/story-chapters.ts; the screen sends the current
  chapter's lines, so there is one source of truth.

Tools:
  show_choices   client tool: the screen shows PhotoChoiceGrid and returns the tapped label.
  save_answer    webhook: POST {API}/story/answer. resident_id and chapter come from the
                 session variables, not from the model.
  draft_chapter  webhook: POST {API}/story/draft. Returns the chapter text to read back.

Product rules in the prompt: one question at a time, picture answers only, never
assume an answer, never approve or narrate a chapter. Approval stays with the
resident on the screen (POST /story/approve).
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

from services import elevenlabs

NAME = "In My Words – Story Interviewer"
# A warm, calm stock voice for the interviewer. It is not the resident's voice.
VOICE_ID = os.environ.get("ELEVENLABS_STORY_VOICE_ID", "EXAVITQu4vr4xnSDxMaL")
LLM = os.environ.get("ELEVENLABS_STORY_LLM", "gemini-2.5-flash")
_HOST = Path(__file__).resolve().parents[2] / "ops" / "host"


def api_base() -> str:
    if os.environ.get("PUBLIC_API_URL"):
        return os.environ["PUBLIC_API_URL"].rstrip("/")
    if _HOST.exists():
        return f"https://api.{_HOST.read_text().strip().replace('.', '-')}.sslip.io"
    sys.exit("Set PUBLIC_API_URL (the public backend URL ElevenLabs can reach).")


PROMPT = """You are the Story Interviewer for In My Words. You help {{resident_name}} tell their own life story, one picture at a time. {{resident_name}} may not speak or read. They answer by tapping a picture on a tablet.

This session is only about the chapter "{{chapter_title}}". Ask these questions, in this order. The options after each question are the only pictures you may offer for it:
{{chapter_questions}}

How you sound:
- Speak like a kind person sitting next to {{resident_name}}. Warm, unhurried, and natural. Not like a recording or a script.
- Use short everyday sentences. End the sentence when you want a pause.
- Never use an em dash, an en dash, or a double hyphen. Use a period or a comma.

Rules:
- Ask one short question at a time. Use plain, everyday words. Speak slowly and warmly.
- For every question, call show_choices with the question and its 2 to 4 options. Never ask without pictures. Never offer an option that is not listed.
- Wait for the tapped label. Never guess, assume or suggest an answer. If no picture is tapped, gently ask again or move on. There is no time limit.
- After each answer: call save_answer with the exact question text and the exact tapped label. Then say a short thank-you, for example "Thank you." Do not add opinions about the answer.
- Stay in this chapter. Do not ask about other topics, and do not add facts {{resident_name}} did not give.
- After the last question, call draft_chapter. Read the returned text aloud exactly as written. Then call show_choices with the question "Is this right?" and the options "Yes" and "No".
- If the answer is "Yes", say: "Thank you. You can save it on the screen." If it is "No", say: "That's okay. We can change it together." Then stop.
- You never approve, save or narrate a chapter yourself. The resident does that on the screen.
- If a tool fails, say "Let's try that again" once. If it fails again, say "Let's take a break" and stop."""

FIRST_MESSAGE = "Hi {{resident_name}}. Let's add to your story about {{chapter_title}}. I'll show you some pictures. Just tap one."

# Defaults so the agent can be tested from the ElevenLabs dashboard.
PLACEHOLDERS = {
    "resident_id": "marcus",
    "resident_name": "Marcus",
    "chapter": "about_me",
    "chapter_title": "About me",
    "chapter_questions": (
        "What is a favourite memory? [Bowling | Family time | The park]\n"
        "Who matters most? [Lisa | My sister | Staff who help]\n"
        "How do you like to start the day? [Coffee | Tea | Quiet]\n"
        "What is a goal this year? [More bowling | See the Raptors | Grow herbs | Learn a song]"
    ),
}


def _string(description: str, **extra) -> dict:
    return {"type": "string", "description": description, **extra}


def tools(api: str) -> list[dict]:
    return [
        {
            "type": "client",
            "name": "show_choices",
            "description": "Show one question with 2 to 4 picture options on the resident's screen. "
                           "Returns the label of the picture the resident tapped.",
            "expects_response": True,
            "response_timeout_secs": 120,
            "parameters": {
                "type": "object",
                "properties": {
                    "question": _string("The question, exactly as written in the chapter list."),
                    "options": {
                        "type": "array",
                        "description": "2 to 4 option labels, exactly as written in the chapter list.",
                        "items": _string("One option label."),
                    },
                },
                "required": ["question", "options"],
            },
        },
        {
            "type": "webhook",
            "name": "save_answer",
            "description": "Save the resident's tapped answer to one interview question.",
            "api_schema": {
                "url": f"{api}/story/answer",
                "method": "POST",
                "request_body_schema": {
                    "type": "object",
                    "properties": {
                        "resident_id": {"type": "string", "dynamic_variable": "resident_id"},
                        "chapter": {"type": "string", "dynamic_variable": "chapter"},
                        "question": _string("The question that was asked, exactly as written."),
                        "answer": _string("The exact label the resident tapped."),
                    },
                    "required": ["resident_id", "chapter", "question", "answer"],
                },
            },
        },
        {
            "type": "webhook",
            "name": "draft_chapter",
            "description": "Write the chapter draft from the saved answers. Returns the text to read back.",
            "api_schema": {
                "url": f"{api}/story/draft",
                "method": "POST",
                "request_body_schema": {
                    "type": "object",
                    "properties": {
                        "resident_id": {"type": "string", "dynamic_variable": "resident_id"},
                        "chapter": {"type": "string", "dynamic_variable": "chapter"},
                    },
                    "required": ["resident_id", "chapter"],
                },
            },
        },
    ]


def config(api: str) -> dict:
    return {
        "name": NAME,
        "tags": ["inmywords", "story"],
        "conversation_config": {
            "agent": {
                "first_message": FIRST_MESSAGE,
                "language": "en",
                "dynamic_variables": {"dynamic_variable_placeholders": PLACEHOLDERS},
                "prompt": {"prompt": PROMPT, "llm": LLM, "temperature": 0.3, "tools": tools(api)},
            },
            "tts": {"voice_id": VOICE_ID, **elevenlabs.AGENT_TTS},
            # Residents tap, so long silences are normal: don't end the call on silence.
            "turn": {"turn_timeout": 30},
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
    existing = os.environ.get("ELEVENLABS_STORY_AGENT_ID")
    if existing:
        resp = await client.patch(f"/convai/agents/{existing}", headers=headers, json=body, timeout=60)
        elevenlabs._raise_for(resp, "update story agent")
        print(f"Updated {NAME}: {existing}")
        agent_id = existing
    else:
        resp = await client.post("/convai/agents/create", headers=headers, json=body, timeout=60)
        elevenlabs._raise_for(resp, "create story agent")
        agent_id = resp.json()["agent_id"]
        print(f"Created {NAME}: {agent_id}")
    print(f"Webhooks call {api}")
    print(f"ELEVENLABS_STORY_AGENT_ID={agent_id}")


if __name__ == "__main__":
    asyncio.run(main("--print" in sys.argv))

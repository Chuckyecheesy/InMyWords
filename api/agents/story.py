"""Story execution layer (T3.4 answers → T3.5 draft → narration).

Order is fixed:

1. record_answer — store the tapped label. A repeat replaces that question.
2. draft — turn those answers into first-person text. No audio.
3. narrate — ElevenLabs, and only after the resident approves the draft.

Nothing in draft calls the voice service. narrate is the only step that does.
"""

from __future__ import annotations

import re

from services import elevenlabs, mcp_client
from services.gemini import SCHEMAS, generate_for

_WORD = re.compile(r"[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*")
_FUNCTION = {
    "a", "an", "the", "i", "i'm", "im", "me", "my", "we", "our",
    "is", "am", "are", "was", "be", "to", "for", "of", "on", "in", "with", "and",
    "what", "who", "how", "where", "when", "do", "does", "you", "your", "it",
}


class StoryError(Exception):
    """The interview cannot take this step."""


def _tokens(text: str) -> set[str]:
    return {match.group(0).lower().replace("'", "") for match in _WORD.finditer(text or "")}


def latest_answers(rows: list[dict]) -> list[dict]:
    """One answer per question, in the order the questions were first saved."""
    order: list[str] = []
    by_question: dict[str, dict] = {}
    for row in rows or []:
        question = (row.get("question") or "").strip()
        answer = (row.get("answer") or "").strip()
        if not question or not answer:
            continue
        if question not in by_question:
            order.append(question)
        by_question[question] = {"question": question, "answer": answer}
    return [by_question[question] for question in order]


def draft_text(name: str, answers: list[dict]) -> str:
    """Say the person's name and each answer. Add no other facts."""
    lines = [f"I'm {name}."]
    for row in answers:
        question = row["question"].strip().rstrip("?").strip()
        answer = row["answer"].strip().rstrip(".")
        lines.append(f"{question}: {answer}.")
    return " ".join(lines)


def grounded(text: str, name: str, answers: list[dict]) -> bool:
    """True when every word is the name, a question, an answer, or a small function word."""
    allowed = set(_FUNCTION) | _tokens(name)
    lowered = (text or "").lower()
    for row in answers:
        allowed |= _tokens(row["question"]) | _tokens(row["answer"])
        if row["answer"].lower() not in lowered:
            return False
    for token in _tokens(text):
        if token not in allowed and not (token.endswith("s") and token[:-1] in allowed):
            return False
    return True


def gemini_phrase(name: str, answers: list[dict]) -> str:
    """Ask Gemini to smooth the draft. The caller keeps it only if grounded()."""
    lines = "\n".join(f"- {row['question']} {row['answer']}" for row in answers)
    prompt = (
        f"Resident name: {name}\n"
        "Write 3 to 5 short first-person sentences using only these answers. "
        "Do not add places, people, or plans that are not in the answers.\n"
        f"{lines}"
    )
    data = generate_for(
        "story",
        prompt,
        SCHEMAS["story"]["draft"],
        system=(
            "Use only the interview answers. Do not add facts. "
            "Write short spoken sentences with periods and commas. "
            "Never use an em dash, an en dash, or a double hyphen. Return JSON."
        ),
        temperature=0.1,
    )
    return data.get("text") or ""


class McpBooks:
    """Data access for the routes. Agents stay off the database."""

    async def resident(self, resident_id: str) -> dict:
        return await mcp_client.get_profile(resident_id)

    async def answers(self, resident_id: str, chapter: str) -> list[dict]:
        result = await mcp_client.get_story_answers(resident_id, chapter)
        return result.get("answers") or []

    async def save_answer(self, resident_id: str, chapter: str, question: str, answer: str) -> dict:
        return await mcp_client.save_story_answer(resident_id, chapter, question, answer)

    async def save_draft(self, resident_id: str, chapter: str, text: str) -> dict:
        return await mcp_client.save_story_chapter(resident_id, chapter, text, [])

    async def chapter(self, chapter_id: int) -> dict:
        return await mcp_client.get_story_chapter(chapter_id)

    async def mark_approved(self, chapter_id: int, audio_url: str) -> dict:
        return await mcp_client.approve_story_chapter(chapter_id, audio_url)


class LocalBooks:
    """Used when the profile server is down. Same steps, lost on restart."""

    def __init__(self):
        self.rows: list[dict] = []
        self.chapters: list[dict] = []
        self._answer_ids = 0
        self._chapter_ids = 0

    async def resident(self, resident_id: str) -> dict:
        name = resident_id[:1].upper() + resident_id[1:]
        return {"name": name, "voice_id": None}

    async def answers(self, resident_id: str, chapter: str) -> list[dict]:
        return [row for row in self.rows
                if row["resident_id"] == resident_id and row["chapter"] == chapter]

    async def save_answer(self, resident_id: str, chapter: str, question: str, answer: str) -> dict:
        for row in self.rows:
            if (row["resident_id"] == resident_id and row["chapter"] == chapter
                    and row["question"] == question):
                row["answer"] = answer
                return {"ok": True, "id": row["id"]}
        self._answer_ids += 1
        row = {"id": self._answer_ids, "resident_id": resident_id, "chapter": chapter,
               "question": question, "answer": answer}
        self.rows.append(row)
        return {"ok": True, "id": row["id"]}

    async def save_draft(self, resident_id: str, chapter: str, text: str) -> dict:
        self._chapter_ids += 1
        row = {"id": self._chapter_ids, "resident_id": resident_id, "chapter": chapter,
               "text": text, "status": "draft", "audio_url": None}
        self.chapters.append(row)
        return {"chapter_id": row["id"], "status": "draft"}

    async def chapter(self, chapter_id: int) -> dict:
        for row in self.chapters:
            if row["id"] == chapter_id:
                return {"chapter": row}
        return {"error": f"no chapter '{chapter_id}'"}

    async def mark_approved(self, chapter_id: int, audio_url: str) -> dict:
        found = await self.chapter(chapter_id)
        if found.get("error"):
            return found
        found["chapter"]["status"] = "approved"
        found["chapter"]["audio_url"] = audio_url
        return found


local_books = LocalBooks()


def _name(resident: dict, resident_id: str) -> str:
    return resident.get("first_name") or resident.get("name") or resident_id


async def record_answer(books, resident_id: str, chapter: str, question: str, answer: str) -> dict:
    label = (answer or "").strip()
    if not label:
        raise StoryError("empty answer")
    saved = await books.save_answer(resident_id, chapter, question.strip(), label)
    if saved.get("error"):
        raise StoryError(saved["error"])
    return {"ok": True, "id": saved.get("id")}


async def draft(books, resident_id: str, chapter: str, *, generate=None) -> dict:
    """Build a draft chapter. generate may phrase it. This never calls ElevenLabs."""
    resident = await books.resident(resident_id)
    if not resident or resident.get("error"):
        raise StoryError(resident.get("error") if resident else f"no resident '{resident_id}'")
    answers = latest_answers(await books.answers(resident_id, chapter))
    if not answers:
        raise StoryError("no answers yet")
    name = _name(resident, resident_id)
    text = draft_text(name, answers)
    if generate:
        try:
            proposed = generate(name, answers)
        except Exception as exc:
            print(f"[story draft] {type(exc).__name__}: {exc}")
        else:
            if proposed and grounded(proposed, name, answers):
                text = proposed
    text = elevenlabs.normalize(text)
    saved = await books.save_draft(resident_id, chapter, text)
    if saved.get("error"):
        raise StoryError(saved["error"])
    return {
        "text": text,
        "chapter_id": saved.get("chapter_id"),
        "status": "draft",
        "audio_url": None,
    }


async def narrate(books, chapter_id: int) -> dict:
    """Speak an approved draft in the resident's voice. Returns filename + cached.

    The route turns filename into a public URL and stores it. A second approve
    of the same chapter does not call ElevenLabs again.
    """
    found = await books.chapter(chapter_id)
    if not found or found.get("error"):
        raise StoryError(found.get("error") if found else f"no chapter '{chapter_id}'")
    chapter = found.get("chapter") or found
    text = (chapter.get("text") or "").strip()
    if not text:
        raise StoryError("nothing to read")
    if chapter.get("status") == "approved" and chapter.get("audio_url"):
        return {"audio_url": chapter["audio_url"], "cached": True, "filename": None}
    resident_id = chapter.get("resident_id") or ""
    if not elevenlabs.configured():
        return {"audio_url": "https://example.com/audio/mock_chapter.mp3", "cached": False, "filename": None,
                "resident_id": resident_id}
    voice_id = elevenlabs.resident_voice(resident_id, chapter.get("voice_id"))
    filename, cached = await elevenlabs.synthesize(voice_id, text)
    return {"filename": filename, "cached": cached, "voice_id": voice_id, "resident_id": resident_id, "text": text}

"""Sentence suggestions for a tile tap (BUILD_PLAN T3.2).

This writes text. It does not play audio. Gemini phrases the sentences when
it is available. Code checks each line: first person, at most 12 words, and
only the tapped tiles plus a confirmed memory that overlaps those tiles.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from services.gemini import SCHEMAS, GeminiError

_WORD = re.compile(r"[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*")
_MAX_WORDS = 12

# Words that carry no extra want. A content word has to be a tile or a memory.
_FUNCTION = {
    "a", "an", "the", "i", "me", "my", "we", "our",
    "can", "want", "have", "get", "go", "need", "like",
    "to", "for", "from", "of", "on", "in", "with", "and",
    "please", "now", "first", "then", "somewhere", "some",
    "is", "am", "it", "this", "that",
}

_SYSTEM = (
    "You write sentence options for a resident who taps picture tiles and "
    "cannot type. Return JSON only. Each option is first person, under 12 "
    "words, and means only what the tapped tiles mean. You may use a "
    "confirmed memory to be specific about a tile they already tapped. "
    "Never add a new want. If the tiles are unclear, one option is a short "
    "neutral sentence such as 'I want coffee.'"
)


def word_count(sentence: str) -> int:
    return len(_WORD.findall(sentence))


def _tokens(text: str) -> set[str]:
    return {match.group(0).lower().replace("'", "") for match in _WORD.finditer(text)}


def _known(token: str, allowed: set[str]) -> bool:
    if token in allowed or token in _FUNCTION:
        return True
    if token.endswith("s") and token[:-1] in allowed:
        return True
    if f"{token}s" in allowed:
        return True
    return False


def load_seed_memories(resident_id: str) -> list[dict]:
    """Seed file fallback when the memory server is down. Not the live database."""
    path = Path(__file__).resolve().parents[2] / "db" / "seed" / "memories.json"
    if not path.is_file():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return [row for row in data.get("memories", []) if row.get("resident_id") == resident_id]


def confirmed_for_tiles(memories: list[dict], tiles: list[str]) -> list[dict]:
    """Confirmed memories that mention a tapped tile. Pending facts stay out."""
    kept = []
    for memory in memories:
        if memory.get("status") not in (None, "confirmed"):
            continue
        content = str(memory.get("content") or "")
        if any(tile.lower() in content.lower() for tile in tiles):
            kept.append(memory)
    return kept


def _allowed(tiles: list[str], memories: list[dict], time_of_day: str) -> set[str]:
    allowed: set[str] = set()
    allowed |= _tokens(" ".join(tiles))
    allowed |= _tokens(time_of_day)
    for memory in confirmed_for_tiles(memories, tiles):
        allowed |= _tokens(str(memory.get("content") or ""))
    return allowed


def is_faithful(
    sentence: str,
    tiles: list[str],
    memories: list[dict],
    time_of_day: str = "",
) -> bool:
    """True when the line is short, first person, and covers every tapped tile."""
    if not sentence or word_count(sentence) > _MAX_WORDS:
        return False
    if not re.search(r"\bI\b", sentence):
        return False
    allowed = _allowed(tiles, memories, time_of_day)
    tokens = _tokens(sentence)
    if any(not _known(token, allowed) for token in tokens):
        return False
    if not tiles:
        return True
    for tile in tiles:
        tile_words = _tokens(tile)
        gloss = set()
        for memory in confirmed_for_tiles(memories, [tile]):
            gloss |= _tokens(str(memory.get("content") or ""))
        if not (tokens & (tile_words | gloss)):
            return False
    return True


def _noun(tile: str, memories: list[dict]) -> str:
    """A short phrase for one tile, using an overlapping confirmed memory."""
    blob = " ".join(str(m.get("content") or "") for m in confirmed_for_tiles(memories, [tile])).lower()
    label = tile.strip()
    key = label.lower()
    if key == "coffee" and "double-double" in blob:
        return "a double-double from Tim's"
    if key == "bowling" and "saturday" in blob:
        return "bowling on Saturday"
    if key == "quiet" and "quiet" in blob:
        return "a quiet space"
    if key == "raptors" and "raptors" in blob:
        return "to see the Raptors"
    if key == "lisa" and "lisa" in blob:
        return "to call Lisa"
    if key == "garden" and "herb" in blob:
        return "the herb garden"
    if key == "sister" and "sister" in blob:
        return "to see my sister"
    if key == "walk" and "walk" in blob:
        return "a walk"
    if key == "tea" and "tea" in blob:
        return "tea"
    return label


def compose(tiles: list[str], memories: list[dict], time_of_day: str = "") -> list[str]:
    """Faithful lines with no model. Used when Gemini is absent or a line fails."""
    if not tiles:
        return ["I need help.", "I need help, please."]
    phrases = [_noun(tile, memories) for tile in tiles]
    joined = " and ".join(phrases)
    plain = " and ".join(tile.strip() for tile in tiles)
    candidates = [
        f"I want {joined}.",
        f"Can I have {joined}, please?",
        f"I want {plain}.",
        f"Can I have {plain}, please?",
    ]
    options: list[str] = []
    seen: set[str] = set()
    for line in candidates:
        key = line.lower()
        if key in seen:
            continue
        if not is_faithful(line, tiles, memories, time_of_day):
            continue
        seen.add(key)
        options.append(line)
        if len(options) == 3:
            break
    if len(options) < 2:
        for line in (f"I want {plain}.", f"Can I have {plain}, please?"):
            if line.lower() not in seen:
                options.append(line)
            if len(options) == 2:
                break
    return options[:3]


def _prompt(name: str, tiles: list[str], time_of_day: str, memories: list[dict]) -> str:
    usable = confirmed_for_tiles(memories, tiles)
    lines = [
        f"Resident: {name}",
        "Tapped tiles: " + (", ".join(tiles) if tiles else "(none)"),
        f"Time of day: {time_of_day or 'unspecified'}",
        "Confirmed memories that overlap those tiles:",
    ]
    if usable:
        lines.extend(f"- {memory.get('content')}" for memory in usable)
    else:
        lines.append("- (none)")
    lines.append(
        "Write 2 or 3 options. One of them may be the plain tile words."
    )
    return "\n".join(lines)


def _accept(raw: object, tiles, memories, time_of_day) -> list[str]:
    if isinstance(raw, dict):
        raw = raw.get("options")
    if not isinstance(raw, list):
        return []
    kept: list[str] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, str):
            continue
        line = " ".join(item.split())
        key = line.lower()
        if key in seen or not is_faithful(line, tiles, memories, time_of_day):
            continue
        seen.add(key)
        kept.append(line)
        if len(kept) == 3:
            break
    return kept


def suggest(
    *,
    resident_id: str,
    name: str,
    tiles: list[str],
    time_of_day: str = "",
    memories: list[dict] | None = None,
    generate="auto",
) -> dict:
    """Return {"options": [2 or 3 sentences]}.

    generate="auto" calls Gemini. generate=None uses the faithful fallback.
    Tests pass a fake generate(prompt, schema, **kwargs).
    """
    remembered = list(memories or [])
    if not remembered:
        remembered = load_seed_memories(resident_id)
    fallback = compose(tiles, remembered, time_of_day)
    options: list[str] = []
    if generate is not None:
        caller = generate
        if generate == "auto":
            from services.gemini import generate_json

            caller = generate_json
        try:
            raw = caller(
                _prompt(name, tiles, time_of_day, remembered),
                SCHEMAS["voice"]["suggestions"],
                system=_SYSTEM,
            )
            options = _accept(raw, tiles, remembered, time_of_day)
        except (GeminiError, ValueError, TypeError, OSError):
            options = []
        except Exception as exc:
            # A live model can be down (rate limit, 503). The tap still gets text.
            print(f"[suggest] {type(exc).__name__}: model skipped")
            options = []
    seen = {line.lower() for line in options}
    for line in fallback:
        if line.lower() not in seen:
            options.append(line)
            seen.add(line.lower())
        if len(options) == 3:
            break
    if len(options) < 2:
        options = fallback[:2]
    return {"options": options[:3]}

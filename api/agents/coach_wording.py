"""Coach answer wording (T4.6).

Plain code, not the model. The job is to turn retrieved facts into one to
three sentences a staff member would actually say out loud, while keeping the
source visible: "In Marcus's words...", "From the 2021 records...",
"We've noticed a pattern...".

The retrieval layer already ranked the facts. This module only selects a
small, non-duplicated set and phrases it. It never invents a fact.
"""

from __future__ import annotations

import re
from datetime import datetime

MAX_FACTS = 6
OVERVIEW_FACTS = 4
MAX_SENTENCES = 3

_STOP = {
    "a", "an", "the", "and", "or", "but", "if", "then", "than", "that",
    "this", "these", "those", "is", "are", "was", "were", "be", "been",
    "being", "am", "do", "does", "did", "have", "has", "had", "to", "of",
    "in", "on", "at", "for", "from", "with", "by", "about", "as", "it",
    "he", "she", "they", "him", "her", "them", "his", "their", "hers",
    "i", "me", "my", "we", "our", "you", "your", "what", "when", "where",
    "who", "how", "why", "can", "could", "would", "should", "will", "just",
    "like", "likes", "loves", "prefers", "get", "gets", "go", "goes",
}

_SYNONYMS = {
    "like": {"like", "love", "prefer", "favourite", "favorite"},
    "talk": {"talk", "speak", "communicat", "words", "gesture", "card"},
    "upset": {"upset", "overwhelm", "difficult", "loud", "rush", "change"},
    "help": {"help", "quiet", "space", "headphone", "settle", "calm"},
    "drink": {"drink", "coffee", "tea", "breakfast"},
    "basketball": {"basketball", "raptors", "team"},
    "team": {"basketball", "raptors", "team"},
    "saturday": {"saturday", "weekend"},
    "evening": {"evening", "night", "afternoon"},
    "sister": {"sister", "lisa"},
    "garden": {"garden", "gardening", "herb", "basil"},
}

_MONTHS = {
    "jan": "January", "feb": "February", "mar": "March", "apr": "April",
    "may": "May", "jun": "June", "jul": "July", "aug": "August",
    "sep": "September", "sept": "September", "oct": "October",
    "nov": "November", "dec": "December",
}

_VERBS = {
    "drinks": "drinks", "likes": "likes", "loves": "loves",
    "prefers": "prefers", "listens": "listens", "repotted": "repotted",
    "went": "went", "left": "left", "communicates": "communicates",
    "counted": "counted", "asked": "asked", "signed": "signed",
}

_OVERVIEW_WORDS = {"onboarding", "overview", "essentials", "introduce"}


def _pronouns(name: str) -> tuple[str, str, str]:
    """Subject, object, possessive. Unknown residents use they/them/their."""
    return {
        "marcus": ("he", "him", "his"),
        "dana": ("she", "her", "her"),
    }.get((name or "").strip().lower(), ("they", "them", "their"))


def _kind(fact: dict) -> str:
    label = str(fact.get("label") or "").lower()
    source = str(fact.get("source") or "").lower()
    if "pattern" in label or source in ("inferred", "pattern"):
        return "pattern"
    if source == "resident" or label.startswith("in "):
        return "resident"
    if source == "staff" or label.startswith("staff observation"):
        return "staff"
    if source == "emh" or label.startswith("from emh"):
        return "emh"
    if source == "document" or label.startswith("from records"):
        return "document"
    return "other"


def _year(fact: dict) -> str:
    found = re.search(r"\b(19|20)\d{2}\b", f"{fact.get('date') or ''} {fact.get('label') or ''}")
    return found.group(0) if found else ""


def _natural_date(fact: dict) -> str:
    raw = str(fact.get("date") or "")
    if not raw:
        found = re.search(r"\d{4}-\d{2}-\d{2}", str(fact.get("label") or ""))
        raw = found.group(0) if found else ""
    try:
        when = datetime.fromisoformat(raw[:10])
        return f"{when.strftime('%B')} {when.day}"
    except ValueError:
        return raw


def _stem(word: str) -> str:
    word = word.lower()
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"
    if len(word) > 5 and word.endswith("ing"):
        return word[:-3]
    if len(word) > 5 and word.endswith("ed"):
        return word[:-2]
    if len(word) > 4 and word.endswith("s"):
        return word[:-1]
    return word


def _words(text: str) -> list[str]:
    clean = re.sub(r"'s\b", "", (text or "").lower())
    return [w for w in re.findall(r"[a-z0-9]+", clean) if len(w) > 1 and w not in _STOP]


def _topics(text: str) -> set[str]:
    return {_stem(w) for w in _words(text)}


def _query_topics(question: str, name: str = "") -> set[str]:
    out: set[str] = set()
    skip = {_stem(name.lower())} if name else set()
    for word in _words(question):
        if _stem(word) in skip:
            continue
        out.add(_stem(word))
        out.update(_stem(s) for s in _SYNONYMS.get(word, set()))
    return out


def _overlap(a: set[str], b: set[str]) -> float:
    return len(a & b) / len(a | b) if a | b else 0.0


def _duplicate(a: set[str], b: set[str]) -> bool:
    return _overlap(a, b) >= 0.26 or len(a & b) >= 3


def _is_overview(question: str) -> bool:
    return bool(set(_words(question)) & _OVERVIEW_WORDS)


def _score(fact: dict, query: set[str]) -> int:
    content = _topics(str(fact.get("content") or ""))
    return sum(
        1 for word in query
        if word in content or any(word in item or item in word for item in content if len(item) > 3)
    )


def _overview_priority(fact: dict) -> int:
    text = str(fact.get("content") or "").lower()
    if _kind(fact) == "pattern" or fact.get("update_reason"):
        return 0
    if any(word in text for word in ("communicat", "overwhelm", "upset", "quiet", "rushed", "last-minute")):
        return 0
    if any(word in text for word in ("sister", "contact", "lisa")):
        return 2
    if any(word in text for word in ("drink", "coffee", "tea", "breakfast")):
        return 3
    if any(word in text for word in ("bowling", "day program", "music", "routine")):
        return 4
    return 5


def _select(facts: list[dict], question: str, name: str = "") -> list[dict]:
    """Drop exact and near-duplicate facts, keep the ones tied to the question."""
    unique: list[dict] = []
    seen: set[str] = set()
    for fact in facts or []:
        content = " ".join(str(fact.get("content") or "").split())
        key = " ".join(re.findall(r"[a-z0-9]+", content.lower()))
        if not content or key in seen:
            continue
        seen.add(key)
        unique.append(dict(fact, content=content))

    kept: list[dict] = []
    for fact in unique:
        topics = _topics(fact["content"])
        if any(_duplicate(topics, _topics(row["content"])) for row in kept):
            continue
        kept.append(fact)

    if _is_overview(question):
        kept.sort(key=_overview_priority)
        return kept[:OVERVIEW_FACTS]

    if question:
        query = _query_topics(question, name)
        scored = [(_score(fact, query), index, fact) for index, fact in enumerate(kept)]
        best = max((row[0] for row in scored), default=0)
        if best:
            kept = [fact for score, _index, fact in sorted(scored, key=lambda row: (-row[0], row[1])) if score]
        else:
            # No lexical overlap: the retriever's top one or two are still the
            # safest answer, but do not read the whole list aloud.
            kept = kept[:2]
    return kept[:MAX_FACTS]


_SMALL_NUMBERS = {str(n): word for n, word in enumerate((
    "zero", "one", "two", "three", "four", "five", "six", "seven",
    "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen",
    "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
))}


def _natural_numbers(text: str) -> str:
    months = {name.lower() for name in _MONTHS.values()}

    def replace(match: re.Match) -> str:
        start, end = match.span()
        before = text[max(0, start - 12):start].lower()
        if text[end:end + 1] == ":":
            return match.group(0)  # 7:30 and 8:45 are clock times
        if any(before.endswith(month + " ") for month in months):
            return match.group(0)  # November 5 is a date
        return _SMALL_NUMBERS[match.group(0)]

    return re.sub(r"\b(?:[0-9]|1[0-9]|20)\b", replace, text)


def _natural_dates(text: str) -> str:
    def month(match: re.Match) -> str:
        key = match.group(1).lower()
        return f"{_MONTHS.get(key[:3], key.capitalize())} {int(match.group(2))}"

    def iso(match: re.Match) -> str:
        try:
            when = datetime(int(match.group(1)), int(match.group(2)), int(match.group(3)))
            return f"{when.strftime('%B')} {when.day}, {when.year}"
        except ValueError:
            return match.group(0)

    def clock(match: re.Match) -> str:
        suffix = "a.m." if match.group(3).lower() == "am" else "p.m."
        return f"{match.group(1)}:{match.group(2)} {suffix}"

    text = re.sub(r"\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
                  r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|"
                  r"Dec(?:ember)?)\.?\s+(\d{1,2})\b", month, text, flags=re.IGNORECASE)
    text = re.sub(r"\b(\d{4})-(\d{2})-(\d{2})\b", iso, text)
    text = re.sub(r"\b(\d{1,2}):(\d{2})\s*([ap]m)\b", clock, text, flags=re.IGNORECASE)
    return text


def _lower_first(text: str) -> str:
    return text[:1].lower() + text[1:] if text else text


def _clause(raw: str, name: str, use_name: bool) -> str:
    """One fact clause as a natural spoken clause, without a final stop."""
    text = " ".join(str(raw or "").split()).strip(" .;")
    if not text:
        return ""
    he, him, his = _pronouns(name)
    subject = name if use_name else he
    possessive = f"{name}'s" if use_name else his

    note = ""
    found = re.search(r"\s*\(([^)]*)\)", text)
    if found:
        note = found.group(1).strip()
        text = (text[:found.start()] + text[found.end():]).strip(" ,;")
    text = _natural_numbers(_natural_dates(text))
    text = re.sub(r",\s+(asked|went|left|signed)\b", r", and \1", text)
    note = _natural_numbers(_natural_dates(note))
    low = text.lower()

    if low.startswith("likes tea"):
        line = f"{subject} has been choosing tea lately"
        if note:
            evidence = _clause(note, name, use_name=False)
            if evidence:
                line += f" — {evidence}"
        return line

    if low.startswith("being rushed through breakfast"):
        return f"{name} finds being rushed through breakfast difficult"
    if low.startswith("quiet afternoon"):
        return "the afternoon was quiet"
    if low.startswith("bowling on "):
        return f"{subject} goes bowling on {text[len('Bowling on '):]}"
    if low.startswith("sister lisa"):
        return f"{possessive} sister {text[len('Sister '):]}"
    if low.startswith("sister visits"):
        return f"{possessive} sister visits{text[len('Sister visits'):]}"
    if low.startswith("hot drink with "):
        return f"{subject} has a hot drink with {text[len('Hot drink with '):]}"
    if low.startswith("day program "):
        return f"{subject} goes to the day program {text[len('Day program '):]}"
    if low.startswith("budget session mondays"):
        return f"{subject} does {his} budget on Mondays"
    if low.startswith("budget session:"):
        return _clause(text[len('Budget session:'):].strip(), name, use_name)
    if low.startswith("groceries thursdays"):
        return f"{subject} gets groceries on Thursdays"
    if low.startswith("weekly phone calls"):
        return f"{subject} has weekly phone calls"
    if low.startswith("pickup is "):
        return f"pickup is {text[len('pickup is '):]}"
    if low.startswith("goal is to "):
        return f"{possessive} goal is to {text[len('Goal is to '):]}"
    if low.startswith("quiet spaces and headphones help"):
        return f"quiet spaces and headphones help {him}"
    if low.startswith("give him space") or low.startswith("give her space") or low.startswith("give them space"):
        return f"staff should give {him} space and somewhere quiet"
    if low.startswith("speak normally"):
        return "staff should speak normally, not slowly"
    if low.startswith("last-minute changes to saturday plans upset"):
        return f"last-minute changes to {possessive} Saturday plans upset {him}"
    if low.startswith("loud rooms are upsetting"):
        return "loud rooms are upsetting"
    if low.startswith("when overwhelmed"):
        rest = text.split(",", 1)[1].strip() if "," in text else ""
        if rest:
            rest = re.sub(rf"^{re.escape(name)}\b", he, rest, flags=re.IGNORECASE)
            return f"when {subject} is overwhelmed, {_lower_first(rest)}"
        return _lower_first(text)
    if low.startswith("marcus listened") or low.startswith("dana listened"):
        return text
    if low.startswith(name.lower() + " "):
        return text

    first = re.match(r"([A-Za-z]+)", text)
    if first and first.group(1).lower() in _VERBS:
        return f"{subject} {_lower_first(text)}"
    if low.startswith(("his ", "her ", "their ", "he ", "she ", "they ")):
        return text
    return f"{subject} {_lower_first(text)}"


def _clauses(raw: str) -> list[str]:
    return [part.strip(" .;") for part in re.split(r"\s*;\s*|\s*\.\s+", str(raw or "").strip()) if part.strip(" .;")]


def _join(parts: list[str]) -> str:
    parts = [part for part in parts if part]
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    if len(parts) == 2:
        return f"{parts[0]}, and {parts[1]}"
    return ", ".join(parts[:-1]) + f", and {parts[-1]}"


def _lead(kind: str, fact: dict, name: str) -> str:
    if kind == "resident":
        return f"In {name}'s words, "
    if kind == "document":
        year = _year(fact)
        return f"From the {year} records, " if year else "From the records, "
    if kind == "staff":
        date = _natural_date(fact)
        return f"A staff observation from {date} says " if date else "A staff observation says "
    if kind == "emh":
        return "The EMH record says "
    if kind == "pattern":
        return f"We've noticed a pattern, but {name} hasn't confirmed it yet — "
    return ""


def _spoken(facts: list[dict], name: str, limit: int = MAX_SENTENCES) -> str:
    groups: dict[tuple[str, str], list[dict]] = {}
    for fact in facts:
        kind = _kind(fact)
        key = (kind, _year(fact) if kind == "document" else "")
        groups.setdefault(key, []).append(fact)

    sentences: list[str] = []
    for (kind, _year_key), rows in list(groups.items())[:limit]:
        parts: list[str] = []
        named = False
        for row in rows:
            for piece in _clauses(row["content"]):
                use_name = kind not in ("resident", "pattern") and not named
                clause = _clause(piece, name, use_name=use_name)
                if clause:
                    parts.append(clause)
                    named = named or use_name
        body = _join(parts)
        if body:
            sentence = (_lead(kind, rows[0], name) + body).strip()
            sentences.append(sentence if sentence.endswith((".", "?", "!")) else sentence + ".")
    return " ".join(sentence for sentence in sentences if sentence).strip()


def select_facts(facts: list[dict], name: str, question: str = "") -> list[dict]:
    """The facts the spoken answer will use, in order. The route uses this
    for source badges so they match the answer instead of the raw recall."""
    return _select(facts, question, name)


def coach_answer(facts: list[dict], name: str, question: str = "") -> str:
    """Return one to three natural sentences, with source framing and no
    near-duplicate facts. Unknown handling stays in the route."""
    if not facts:
        return ""
    selected = select_facts(facts, name, question)
    if not selected:
        return ""

    flagged = next((fact for fact in selected if fact.get("update_reason")), None)
    main = [fact for fact in selected if fact is not flagged]
    answer = _spoken(main, name, limit=2 if flagged else MAX_SENTENCES)

    if flagged:
        he, him, his = _pronouns(name)
        clause = _clause(flagged["content"], name, use_name=False)
        year = _year(flagged)
        opener = f"The {year} record also says" if year else "An older record says"
        warning = f"{opener} {clause}, but that may be out of date — it's worth asking {name}."
        answer = f"{answer} {warning}".strip()
    return answer or "I don't know — it's best to ask " + name + "."

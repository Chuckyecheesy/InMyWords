"""Shared Gemini wrapper (BUILD_PLAN T3.1).

Two functions, used by every agent. Prompts stay in the agents.

    generate_json(prompt, schema) -> dict     structured output, validated
    embed(text) -> list[float]                768-d vector, size fixed

`schema` is a JSON Schema object (`type: object`). The shapes the team
agreed on are in `SCHEMAS`, grouped by agent: `SCHEMAS["voice"]["suggestions"]`.
A sample that already validates is in `EXAMPLES`, with the same keys.

Lookup names (`voice`, `suggestions`, …) are internal. They are not API fields.
Property names inside a schema follow the frozen contract where one exists
(`options`, `text`, `answer`, `sources`, `online_steps`, `staff_tasks`, `items`).
Those strings stay as written in docs/CONTRACTS.md.

Embedding length is `EMBEDDING_DIM` (768). That matches
`db/schema.sql` (`memories.embedding VECTOR(768)`). Do not change it.

Budget and cost totals are not in any schema. Code adds those up.
The model only phrases a result it was given.

Import from the API process (run commands with `api/` as the working directory):

    from services.gemini import EMBEDDING_DIM, EXAMPLES, SCHEMAS, embed, generate_json
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import jsonschema
from google import genai
from jsonschema import Draft202012Validator

EMBEDDING_DIM = 768
FLASH_MODEL = "gemini-3.8-flash"
STEADY_MODEL = "gemini-3.5-flash"
LITE_MODEL = "gemini-3.5-flash-lite"

# (primary, fallback) per feature. Hard work (writing, extracting) uses the
# steady model; easy work (yes/no, one short sentence) uses the lite model,
# which also has its own request budget. Fallbacks use a different model so
# one overloaded model does not stop a feature.
# Override with GEMINI_MODEL_<FEATURE> and GEMINI_MODEL_<FEATURE>_FALLBACK.
FEATURE_MODELS = {
    "voice": (LITE_MODEL, STEADY_MODEL),   # fastest first; compose() is the last fallback
    "coach": (STEADY_MODEL, FLASH_MODEL),
    "handoff": (STEADY_MODEL, FLASH_MODEL),
    "story": (STEADY_MODEL, FLASH_MODEL),
    "memory": (STEADY_MODEL, FLASH_MODEL),
    "memory_easy": (LITE_MODEL, STEADY_MODEL),
    "photo": (STEADY_MODEL, FLASH_MODEL),  # T4.2 photo checker (vision)
    "action": (LITE_MODEL, STEADY_MODEL),  # T4.7 Action agent: lite measured 1-5s, 5/5 goals
    "planner": (STEADY_MODEL, FLASH_MODEL),  # Planner subagent: tool calls that write calendar events
}
EMBED_MODEL = "gemini-embedding-001"

# Stored memories use RETRIEVAL_DOCUMENT. Recall queries use RETRIEVAL_QUERY.
TASK_TYPES = (
    "RETRIEVAL_DOCUMENT",
    "RETRIEVAL_QUERY",
    "SEMANTIC_SIMILARITY",
    "CLASSIFICATION",
    "CLUSTERING",
)

# Value strings below are frozen in docs/CONTRACTS.md and the web types.
# `emh` is the EMHware case record (contact notes, checklist, events), not a label we can rename.
_MEMORY_TYPES = ["preference", "event", "routine"]
_COACH_SOURCES = ["resident", "staff", "emh", "document", "pattern"]
_MEMORY_SOURCES = ["resident", "staff", "emh", "document", "inferred", "pattern"]
_OBSERVER_SOURCES = ["inferred", "staff"]
_ONLINE_STEPS = ["send_message", "add_to_calendar", "book_activity", "next_bus"]
# Action agent proposer: the four allowlisted tools (agents/action.py ALLOWED_STEPS).
_PLAN_STEPS = ["book_activity", "add_to_calendar", "send_message", "create_staff_task"]
# Item kinds the staff handoff screen keeps (web/lib/api.ts normalizeHandoff).
_HANDOFF_TYPES = ["emh", "checklist", "observation", "choice", "task", "memory"]
_DATE = {"type": "string", "format": "date", "pattern": r"^\d{4}-\d{2}-\d{2}$"}


class GeminiError(Exception):
    """The wrapper could not return a usable result."""


class GeminiSchemaError(GeminiError):
    """The model answer did not match the schema."""


def _object(description: str, properties: dict, required: list[str]) -> dict:
    return {
        "type": "object",
        "description": description,
        "additionalProperties": False,
        "properties": properties,
        "required": required,
    }


# Grouped by agent. Pass SCHEMAS["voice"]["suggestions"], not a flat key.
SCHEMAS: dict[str, dict] = {
    "voice": {
        "suggestions": _object(
            "Speak For Me. 2 or 3 first-person sentences the resident can approve. "
            "Each sentence is under 12 words and only means what the tapped tiles mean. "
            "Never add a new want. If the tiles are unclear, one option is a short "
            'neutral sentence such as "I want coffee."',
            {
                "options": {
                    "type": "array",
                    "minItems": 2,
                    "maxItems": 3,
                    "items": {"type": "string"},
                }
            },
            ["options"],
        ),
    },
    "story": {
        "draft": _object(
            "My Story chapter draft. 3 to 5 first-person sentences. "
            "Use only the interview answers. Do not add facts. "
            "No em dashes or en dashes.",
            {"text": {"type": "string"}},
            ["text"],
        ),
    },
    "choice": {
        "consequences": _object(
            "Supported Choice. One short neutral line per option, including "
            '"not decided yet". Do not recommend. Do not write prices or money '
            "left, code calculates those and appends them onto each option.",
            {
                "options": {
                    "type": "array",
                    "minItems": 1,
                    "items": _object(
                        "One option, in the same order as the prompt.",
                        {
                            "label": {"type": "string"},
                            "consequence": {"type": "string"},
                        },
                        ["label", "consequence"],
                    ),
                }
            },
            ["options"],
        ),
    },
    "coach": {
        "answer": _object(
            "Onboarding Coach. 1 to 3 plain sentences grounded in the supplied facts. "
            "If none of the facts answer the question, say so in answer and leave sources empty. "
            "No em dashes or en dashes. "
            "Source type pattern means a noticed pattern, not the resident's words.",
            {
                "answer": {"type": "string"},
                "sources": {
                    "type": "array",
                    "items": _object(
                        "One fact the answer used.",
                        {
                            "type": {"type": "string", "enum": _COACH_SOURCES},
                            "date": _DATE,
                        },
                        ["type", "date"],
                    ),
                },
            },
            ["answer", "sources"],
        ),
    },
    "memory": {
        "document_facts": _object(
            "Binder import. Facts the document states, and only those. "
            "Keep the document's date. Never invent a date. "
            "Callers save these with source document and status pending.",
            {
                "facts": {
                    "type": "array",
                    "items": _object(
                        "One fact copied from the document.",
                        {
                            "type": {"type": "string", "enum": _MEMORY_TYPES},
                            "content": {"type": "string"},
                            "date": _DATE,
                        },
                        ["type", "content", "date"],
                    ),
                }
            },
            ["facts"],
        ),
        "candidates": _object(
            "Memory observer. Candidate memories from one interaction. "
            "source is inferred, or staff when the input is a staff note. "
            "Never resident and never document. evidence is the phrase it came from.",
            {
                "candidates": {
                    "type": "array",
                    "items": _object(
                        "One candidate memory.",
                        {
                            "type": {"type": "string", "enum": _MEMORY_TYPES},
                            "content": {"type": "string"},
                            "evidence": {"type": "string"},
                            "source": {"type": "string", "enum": _OBSERVER_SOURCES},
                        },
                        ["type", "content", "evidence", "source"],
                    ),
                }
            },
            ["candidates"],
        ),
        "routine": _object(
            "Routine finder. One plain sentence for a pattern code already counted. "
            "Use only the weekday, hour, and count in the prompt. Do not guess a cause. "
            "content is the memories.content column this phrase is stored in.",
            {"content": {"type": "string"}},
            ["content"],
        ),
        "contradiction": _object(
            "Consolidator. Does the candidate contradict the confirmed memory? "
            "reason is the propose_update argument: one sentence the resident can hear, "
            "or empty when contradicts is false. This schema does not change stored words.",
            {
                "contradicts": {"type": "boolean"},
                "reason": {"type": "string"},
            },
            ["contradicts", "reason"],
        ),
    },
    "action": {
        "steps": _object(
            "Action agent step proposer. Steps from the allowlist only. "
            "No costs or totals: code prices every step. Empty strings for fields a step does not use.",
            {
                "steps": {
                    "type": "array",
                    "items": _object(
                        "One proposed step.",
                        {
                            "step": {"type": "string", "enum": _PLAN_STEPS},
                            "detail": {"type": "string"},
                            "activity": {"type": "string"},
                            "time": {"type": "string"},
                            "title": {"type": "string"},
                            "contact": {"type": "string"},
                            "text": {"type": "string"},
                            "task": {"type": "string"},
                        },
                        ["step", "detail", "activity", "time", "title", "contact", "text", "task"],
                    ),
                },
            },
            ["steps"],
        ),
        "plan": _object(
            "Action agent. Steps from the allowlist only. "
            "create_staff_task is staff_tasks, not an online step. "
            "cost is the price the prompt supplied for that step, copied, not calculated. "
            "Do not include a total, code sums cost.",
            {
                "online_steps": {
                    "type": "array",
                    "items": _object(
                        "One online step.",
                        {
                            "step": {"type": "string", "enum": _ONLINE_STEPS},
                            "detail": {"type": "string"},
                            "cost": {"type": "number", "minimum": 0},
                        },
                        ["step", "detail", "cost"],
                    ),
                },
                "staff_tasks": {
                    "type": "array",
                    "items": _object(
                        "Physical help for staff.",
                        {
                            "task": {"type": "string"},
                            "due": {"type": "string"},
                        },
                        ["task", "due"],
                    ),
                },
            },
            ["online_steps", "staff_tasks"],
        ),
    },
    "handoff": {
        "items": _object(
            "Handoff. One short factual bullet per input item. Keep the date. "
            "Do not guess why something happened. type names are the ones the "
            "staff screen renders.",
            {
                "items": {
                    "type": "array",
                    "items": _object(
                        "One handoff bullet.",
                        {
                            "type": {"type": "string", "enum": _HANDOFF_TYPES},
                            "date": _DATE,
                            "text": {"type": "string"},
                            "source": {"type": "string", "enum": _MEMORY_SOURCES},
                        },
                        ["type", "date", "text"],
                    ),
                }
            },
            ["items"],
        ),
    },
}

EXAMPLES: dict[str, dict] = {
    "voice": {
        "suggestions": {
            "options": [
                "I want a coffee, please.",
                "Can I get a double-double from Tim's?",
            ]
        },
    },
    "story": {
        "draft": {
            "text": (
                "I'm Marcus. Saturdays are for bowling. "
                "I get a double-double on the way. Quiet rooms are easier for me."
            )
        },
    },
    "choice": {
        "consequences": {
            "options": [
                {"label": "bowling", "consequence": "You would go bowling on Saturday."},
                {"label": "movie", "consequence": "You would go to a movie."},
                {
                    "label": "not decided yet",
                    "consequence": "That's okay. We can come back to this.",
                },
            ]
        },
    },
    "coach": {
        "answer": {
            "answer": "Loud rooms upset Marcus. A quiet space helps him settle.",
            "sources": [
                {"type": "resident", "date": "2026-11-02"},
                {"type": "document", "date": "2021-03-15"},
            ],
        },
    },
    "memory": {
        "document_facts": {
            "facts": [
                {
                    "type": "preference",
                    "content": "Coffee order is a double-double from Tim's.",
                    "date": "2019-04-12",
                }
            ]
        },
        "candidates": {
            "candidates": [
                {
                    "type": "preference",
                    "content": "Has been choosing tea.",
                    "evidence": "Picked the tea tile five times this week.",
                    "source": "inferred",
                }
            ]
        },
        "routine": {
            "content": "Marcus asks for coffee around 7:30 on weekday mornings."
        },
        "contradiction": {
            "contradicts": True,
            "reason": "The record says coffee, and this week he keeps choosing tea.",
        },
    },
    "action": {
        "steps": {
            "steps": [
                {"step": "book_activity", "detail": "Bowling at KW Bowl, Saturday 2:00pm",
                 "activity": "bowling", "time": "2026-11-14T14:00:00", "title": "",
                 "contact": "", "text": "", "task": ""},
                {"step": "send_message", "detail": "Email Lisa about Saturday bowling",
                 "activity": "", "time": "", "title": "", "contact": "lisa",
                 "text": "Marcus is going bowling on Saturday at 2pm. Would you like to join?",
                 "task": ""},
                {"step": "create_staff_task", "detail": "Drive Marcus to KW Bowl",
                 "activity": "", "time": "2026-11-14T13:30:00", "title": "", "contact": "",
                 "text": "", "task": "Drive Marcus to KW Bowl"},
            ],
        },
        "plan": {
            "online_steps": [
                {
                    "step": "book_activity",
                    "detail": "Lane at KW Bowl, Saturday 2:00pm",
                    "cost": 15,
                },
                {
                    "step": "add_to_calendar",
                    "detail": "Bowling, Saturday 2:00pm",
                    "cost": 0,
                },
                {
                    "step": "send_message",
                    "detail": "Email Lisa about Saturday bowling.",
                    "cost": 0,
                },
            ],
            "staff_tasks": [
                {"task": "Drive Marcus to KW Bowl", "due": "Saturday 1:30pm"}
            ],
        },
    },
    "handoff": {
        "items": {
            "items": [
                {
                    "type": "choice",
                    "date": "2026-11-06",
                    "text": "Marcus chose bowling for Saturday.",
                },
                {
                    "type": "task",
                    "date": "2026-11-07",
                    "text": "Ride needed: drive Marcus to KW Bowl, Saturday 1:30pm.",
                },
                {
                    "type": "memory",
                    "date": "2026-11-06",
                    "text": "Pattern noticed: Marcus picked tea 5 times this week.",
                    "source": "pattern",
                },
            ]
        },
    },
}


def _validator(schema: dict) -> Draft202012Validator:
    if not isinstance(schema, dict) or schema.get("type") != "object":
        raise ValueError("schema must be a JSON Schema object with type 'object'")
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=jsonschema.FormatChecker())


def _error_text(error: jsonschema.ValidationError) -> str:
    loc = "/".join(str(part) for part in error.path) or "(root)"
    return f"{loc}: {error.message}"


def _gemini_schema(schema: dict) -> dict:
    """Copy of schema safe for the Gemini Developer API.

    additionalProperties is rejected outside Vertex / Gemini Enterprise.
    Local validation still uses the original schema.
    """

    def strip(node):
        if isinstance(node, dict):
            return {
                key: strip(value)
                for key, value in node.items()
                if key != "additionalProperties"
            }
        if isinstance(node, list):
            return [strip(item) for item in node]
        return node

    return strip(schema)


def _load_env() -> None:
    path = Path(__file__).resolve().parents[2] / ".env"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        text = line.strip()
        if not text or text.startswith("#") or "=" not in text:
            continue
        key, value = text.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _client():
    _load_env()
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise GeminiError("GEMINI_API_KEY is not set")
    return genai.Client(api_key=key)


def _payload(response) -> dict:
    text = getattr(response, "text", None)
    if text:
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            raise GeminiSchemaError(f"model returned invalid JSON: {exc}") from exc
    else:
        data = getattr(response, "parsed", None)
    if not isinstance(data, dict):
        raise GeminiSchemaError("model returned no JSON object")
    return data


def generate_json(
    prompt: str,
    schema: dict,
    *,
    system: str | None = None,
    model: str | None = None,
    temperature: float = 0.2,
    client=None,
    attempts: int = 2,
    timeout_ms: int = 20000,
    images: list[tuple[bytes, str]] | None = None,
) -> dict:
    """Return JSON that validates against `schema`.

    One retry is included when the first answer fails validation.
    `client` is the google-genai client. Tests pass a fake; callers omit it.
    `images` (additive, T4.2 photo checker): [(bytes, mime_type)] sent before
    the prompt so the model can look at them. Text-only callers are unchanged.
    """
    if not prompt or not prompt.strip():
        raise ValueError("prompt is empty")
    validator = _validator(schema)
    gen = client or _client()
    config = {
        "temperature": temperature,
        "response_mime_type": "application/json",
        "response_json_schema": _gemini_schema(schema),
        # One attempt, at least 10s. Shorter deadlines are rejected, and
        # the default retry loop holds a tile tap open for a minute.
        "http_options": {"timeout": timeout_ms, "retry_options": {"attempts": 1}},
    }
    if system:
        config["system_instruction"] = system

    last_error = "no response"
    parts = []
    if images:
        from google.genai import types
        parts = [types.Part.from_bytes(data=data, mime_type=mime) for data, mime in images]
    contents = parts + [prompt] if parts else prompt
    for _attempt in range(max(1, attempts)):
        response = gen.models.generate_content(
            model=model or os.environ.get("GEMINI_MODEL", FLASH_MODEL),
            contents=contents,
            config=config,
        )
        try:
            data = _payload(response)
        except GeminiSchemaError as exc:
            last_error = str(exc)
        else:
            errors = sorted(validator.iter_errors(data), key=lambda err: list(err.path))
            if not errors:
                return data
            last_error = "; ".join(_error_text(err) for err in errors[:5])
        retry = (
            prompt
            + "\n\nYour previous answer failed validation: "
            + last_error
            + "\nReturn only JSON that matches the schema."
        )
        contents = parts + [retry] if parts else retry
    raise GeminiSchemaError(last_error)


def models_for(feature: str) -> list[str]:
    primary, fallback = FEATURE_MODELS[feature]
    key = f"GEMINI_MODEL_{feature.upper()}"
    primary = os.environ.get(key) or primary
    fallback = os.environ.get(key + "_FALLBACK") or fallback
    return [primary] + ([fallback] if fallback and fallback != primary else [])


def generate_for(feature: str, prompt: str, schema: dict, **kwargs) -> dict:
    """generate_json with the feature's model, then its fallback on any
    service error (503, 504, 429). With a fallback the first try gets the
    shortest deadline Gemini accepts, so a hung model costs ~10s, not 20s."""
    chain = models_for(feature)
    last: Exception | None = None
    for index, model in enumerate(chain):
        extra = {"timeout_ms": 10000} if index < len(chain) - 1 else {}
        try:
            return generate_json(prompt, schema, model=model, **{**extra, **kwargs})
        except ValueError:
            raise
        except Exception as exc:  # network, 5xx, quota, bad schema
            last = exc
            print(f"[gemini] {feature}: {model} failed ({type(exc).__name__}); "
                  + ("trying fallback" if index < len(chain) - 1 else "no fallback left"))
    assert last is not None
    raise last


def run_tools(
    feature: str,
    prompt: str,
    functions: list[dict],
    execute,
    *,
    system: str | None = None,
    max_turns: int = 6,
    should_stop=None,
    client=None,
    timeout_ms: int = 20000,
    use_fallback_model: bool = True,
) -> dict:
    """Let the model work through tool calls (function calling, manual loop).

    functions: [{"name", "description", "parameters": JSON Schema}].
    execute(name, args) -> dict runs one call; its result goes back to the
    model. The caller's execute is the guardrail: nothing runs unless it
    says so. Automatic function calling is off, so the SDK never runs
    anything on its own.
    should_stop(calls) -> bool ends the loop early (e.g. the calendar is down).

    Returns {"calls": [{"name", "args", "result"}], "text", "turns", "model",
    "finished"}. finished is False when max_turns ran out mid-work. Falls
    back to the feature's second model only if the first failed before any
    call ran, so a retry never repeats a write. use_fallback_model=False
    skips that, for callers whose own fallback is faster (plain code).
    """
    from google.genai import types

    if not prompt or not prompt.strip():
        raise ValueError("prompt is empty")
    gen = client or _client()
    config = {
        "temperature": 0.1,
        "tools": [types.Tool(function_declarations=[
            types.FunctionDeclaration(name=f["name"], description=f["description"],
                                      parameters_json_schema=_gemini_schema(f["parameters"]))
            for f in functions])],
        "automatic_function_calling": {"disable": True},
        "http_options": {"timeout": timeout_ms, "retry_options": {"attempts": 1}},
    }
    if system:
        config["system_instruction"] = system

    calls: list[dict] = []
    last: Exception | None = None
    chain = models_for(feature) if use_fallback_model else models_for(feature)[:1]
    for model in chain:
        contents = [types.Content(role="user", parts=[types.Part.from_text(text=prompt)])]
        try:
            for turn in range(1, max_turns + 1):
                response = gen.models.generate_content(model=model, contents=contents, config=config)
                wanted = list(getattr(response, "function_calls", None) or [])
                if not wanted:
                    return {"calls": calls, "text": getattr(response, "text", "") or "",
                            "turns": turn, "model": model, "finished": True}
                contents.append(response.candidates[0].content)
                replies = []
                for fc in wanted:
                    args = dict(fc.args or {})
                    try:
                        result = execute(fc.name, args)
                    except Exception as exc:  # a bad call is reported to the model, not raised
                        result = {"error": f"{type(exc).__name__}: {exc}"}
                    if not isinstance(result, dict):
                        result = {"result": result}
                    calls.append({"name": fc.name, "args": args, "result": result})
                    replies.append(types.Part.from_function_response(name=fc.name, response=result))
                contents.append(types.Content(role="user", parts=replies))
                if should_stop and should_stop(calls):
                    return {"calls": calls, "text": "", "turns": turn, "model": model, "finished": True}
            return {"calls": calls, "text": "", "turns": max_turns, "model": model, "finished": False}
        except Exception as exc:  # network, 5xx, quota
            last = exc
            print(f"[gemini] {feature}: {model} tool loop failed ({type(exc).__name__})")
            if calls:
                break  # something already ran; never replay writes on another model
    assert last is not None
    raise last


def _as_vector(values) -> list[float]:
    if not isinstance(values, list) or not values:
        raise GeminiError("embedding response was empty")
    try:
        vector = [float(value) for value in values]
    except (TypeError, ValueError) as exc:
        raise GeminiError("embedding values were not numbers") from exc
    if len(vector) > EMBEDDING_DIM:
        vector = vector[:EMBEDDING_DIM]
    if len(vector) != EMBEDDING_DIM:
        raise GeminiError(
            f"embedding length {len(vector)} is under the fixed size {EMBEDDING_DIM}"
        )
    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0:
        raise GeminiError("embedding was all zeros")
    return [value / norm for value in vector]


def embed(
    text: str | list[str],
    *,
    task_type: str = "RETRIEVAL_DOCUMENT",
    model: str | None = None,
    client=None,
) -> list[float] | list[list[float]]:
    """Embed text at the fixed 768-dimension size.

    A string returns one vector. A list returns one vector per string, same order.
    Vectors are L2-normalized. Reduced Gemini dimensions need that for cosine search.
    Pass task_type RETRIEVAL_QUERY when embedding a recall query.
    """
    if task_type not in TASK_TYPES:
        raise ValueError(f"task_type must be one of {TASK_TYPES}")
    batch = isinstance(text, list)
    texts = text if batch else [text]
    if not texts or any(not isinstance(item, str) or not item.strip() for item in texts):
        raise ValueError("text must be a non-empty string or list of non-empty strings")

    gen = client or _client()
    response = gen.models.embed_content(
        model=model or os.environ.get("GEMINI_EMBED_MODEL", EMBED_MODEL),
        contents=texts if batch else texts[0],
        config={
            "output_dimensionality": EMBEDDING_DIM,
            "task_type": task_type,
        },
    )
    embeddings = getattr(response, "embeddings", None) or []
    if len(embeddings) != len(texts):
        raise GeminiError(
            f"expected {len(texts)} embeddings, got {len(embeddings)}"
        )
    vectors = [_as_vector(getattr(item, "values", None)) for item in embeddings]
    return vectors if batch else vectors[0]

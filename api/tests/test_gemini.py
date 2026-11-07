"""T3.1: the wrapper returns valid JSON for a test schema, with no API key.

Run from api/:

    python -m unittest tests.test_gemini
"""

from __future__ import annotations

import json
import math
import os
import unittest
from types import SimpleNamespace

from services.gemini import (
    EMBEDDING_DIM,
    EXAMPLES,
    SCHEMAS,
    GeminiError,
    GeminiSchemaError,
    embed,
    generate_json,
)


def _no_additional(node) -> None:
    if isinstance(node, dict):
        if "additionalProperties" in node:
            raise AssertionError("additionalProperties leaked into the Gemini schema")
        for value in node.values():
            _no_additional(value)
    elif isinstance(node, list):
        for item in node:
            _no_additional(item)


class _Scripted:
    """Minimal stand-in for google.genai.Client.models."""

    def __init__(self, texts: list[str]):
        self.texts = list(texts)
        self.calls = []

    def generate_content(self, *, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        return SimpleNamespace(text=self.texts.pop(0), parsed=None)


class _Client:
    def __init__(self, texts: list[str]):
        self.models = _Scripted(texts)


class _EmbedModels:
    def __init__(self, dimensions: int):
        self.dimensions = dimensions
        self.calls = []

    def embed_content(self, *, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        texts = contents if isinstance(contents, list) else [contents]
        embeddings = [
            SimpleNamespace(values=[float(index + 1)] * self.dimensions)
            for index, _text in enumerate(texts)
        ]
        return SimpleNamespace(embeddings=embeddings)


class _EmbedClient:
    def __init__(self, dimensions: int):
        self.models = _EmbedModels(dimensions)


def _schema_leaves(schemas, examples, prefix=""):
    """Yield (path, schema, example) for each agent schema, not the group dicts."""
    if set(schemas) != set(examples):
        raise AssertionError(f"{prefix or 'root'} keys {set(schemas)} != {set(examples)}")
    for key in schemas:
        path = f"{prefix}.{key}" if prefix else key
        schema = schemas[key]
        example = examples[key]
        if schema.get("type") == "object" and "properties" in schema:
            yield path, schema, example
        else:
            yield from _schema_leaves(schema, example, path)


class GenerateJsonTests(unittest.TestCase):
    def test_every_agreed_schema_returns_valid_json(self):
        leaves = list(_schema_leaves(SCHEMAS, EXAMPLES))
        self.assertGreaterEqual(len(leaves), 10)
        for name, schema, example in leaves:
            client = _Client([json.dumps(example)])
            got = generate_json(f"test {name}", schema, client=client)
            self.assertEqual(got, example, name)
            _no_additional(client.models.calls[0]["config"]["response_json_schema"])
            self.assertIn("additionalProperties", json.dumps(schema))

    def test_retries_once_then_returns_valid_json(self):
        good = {"options": ["I want coffee.", "Coffee, please."]}
        client = _Client(["{\"options\": []}", json.dumps(good)])
        got = generate_json("tiles: coffee", SCHEMAS["voice"]["suggestions"], client=client)
        self.assertEqual(got, good)
        self.assertEqual(len(client.models.calls), 2)
        self.assertIn("failed validation", client.models.calls[1]["contents"])

    def test_raises_when_both_attempts_fail(self):
        client = _Client(["not-json", "{\"options\": [\"only one\"]}"])
        with self.assertRaises(GeminiSchemaError):
            generate_json("tiles: coffee", SCHEMAS["voice"]["suggestions"], client=client)
        self.assertEqual(len(client.models.calls), 2)

    def test_missing_key_raises(self):
        os.environ.pop("GEMINI_API_KEY", None)
        with self.assertRaises(GeminiError):
            generate_json("hello", SCHEMAS["memory"]["routine"])


class EmbedTests(unittest.TestCase):
    def test_truncates_to_fixed_size_and_normalizes(self):
        client = _EmbedClient(3072)
        vector = embed("likes tea", client=client)
        self.assertEqual(len(vector), EMBEDDING_DIM)
        self.assertAlmostEqual(math.sqrt(sum(value * value for value in vector)), 1.0, places=6)
        self.assertEqual(client.models.calls[0]["config"]["output_dimensionality"], EMBEDDING_DIM)
        self.assertEqual(client.models.calls[0]["config"]["task_type"], "RETRIEVAL_DOCUMENT")

    def test_batch_and_query_task_type(self):
        client = _EmbedClient(EMBEDDING_DIM)
        vectors = embed(["coffee", "tea"], task_type="RETRIEVAL_QUERY", client=client)
        self.assertEqual(len(vectors), 2)
        self.assertTrue(all(len(vector) == EMBEDDING_DIM for vector in vectors))
        self.assertEqual(client.models.calls[0]["config"]["task_type"], "RETRIEVAL_QUERY")
        self.assertEqual(client.models.calls[0]["contents"], ["coffee", "tea"])

    def test_rejects_short_vector_and_empty_text(self):
        with self.assertRaises(GeminiError):
            embed("coffee", client=_EmbedClient(10))
        with self.assertRaises(ValueError):
            embed("  ", client=_EmbedClient(EMBEDDING_DIM))
        with self.assertRaises(ValueError):
            embed("coffee", task_type="SEARCH", client=_EmbedClient(EMBEDDING_DIM))


if __name__ == "__main__":
    unittest.main()

/** Phase 4: typing suggestions are personal, tap-only, and predictable. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildVocabulary, suggestWords } from "../lib/input/word-suggest.ts";

const VOCAB = buildVocabulary(["coffee", "bowling", "Raptors", "quiet", "Lisa"]);

test("the resident's own tile words come before core vocabulary", () => {
  const words = suggestWords("c", VOCAB);
  assert.equal(words[0], "coffee");
});

test("prefix matches beat contains matches", () => {
  const words = suggestWords("qu", VOCAB);
  assert.equal(words[0], "quiet");
});

test("no suggestions for empty input; the exact word is not repeated", () => {
  assert.deepEqual(suggestWords("", VOCAB), []);
  assert.ok(!suggestWords("coffee", VOCAB).includes("coffee"));
});

test("vocabulary dedupes case-insensitively and keeps personal order", () => {
  const vocabulary = buildVocabulary(["Tea", "tea", "walk"]);
  assert.equal(vocabulary.filter((word) => word === "tea").length, 1);
  assert.ok(vocabulary.indexOf("tea") < vocabulary.indexOf("yes"));
});

test("limit respected", () => {
  assert.ok(suggestWords("t", buildVocabulary(["tea", "tv", "tired", "today", "tomorrow"])).length <= 4);
});

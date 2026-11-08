/** T1.4: the Story agent's option labels become the right photo tiles. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { chapterQuestionLines, choicesFromLabels } from "../lib/story-agent.ts";
import { questionsFor } from "../lib/story-chapters.ts";

test("labels from the matching question keep that question's photos", () => {
  const [first] = questionsFor("marcus", "about_me");
  const labels = first.options.map((option) => option.label);
  const result = choicesFromLabels("marcus", "about_me", first.question, labels);
  assert.equal(result.question, first.question);
  assert.deepEqual(result.options, first.options);
});

test("matching ignores case and spacing, and keeps the agent's order", () => {
  const result = choicesFromLabels("marcus", "my_day", "What is your morning drink?", [" tea", "COFFEE "]);
  assert.deepEqual(result.options.map((option) => option.label), ["Tea", "Coffee"]);
  assert.ok(result.options.every((option) => option.photo_id), "both have photos");
});

test("a label we cannot place still shows as a text tile, and at most 4 show", () => {
  const result = choicesFromLabels("marcus", "about_me", "Anything?", ["Coffee", "Spaceships", "Tea", "Quiet", "Music"]);
  assert.equal(result.options.length, 4);
  assert.deepEqual(result.options[1], { label: "Spaceships", photo_id: "" });
});

test("question lines match the agent prompt format", () => {
  const lines = chapterQuestionLines("marcus", "about_me").split("\n");
  assert.equal(lines.length, questionsFor("marcus", "about_me").length);
  assert.match(lines[0], /^.+\? \[.+( \| .+)+\]$/);
});

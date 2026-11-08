import assert from "node:assert/strict";
import { test } from "node:test";
import { serviceSentence } from "../lib/services.ts";

test("category selections become complete first-person sentences", () => {
  assert.equal(serviceSentence([]), "");
  assert.equal(serviceSentence(["refreshments"]), "I would like some refreshments.");
  assert.equal(serviceSentence(["entertainment"]), "I would like some entertainment.");
  assert.equal(serviceSentence(["family"]), "I would like help contacting my family.");
  assert.equal(serviceSentence(["family", "refreshments"]), "I would like some refreshments and help contacting my family.");
  assert.equal(serviceSentence(["refreshments", "family", "entertainment"]), "I would like some refreshments, some entertainment, and help contacting my family.");
});

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

test("picture choices update the editable sentence without losing typed or spoken words", async () => {
  const { mergeSentence } = await import("../lib/services.ts");
  const coffee = "I would like some refreshments.";
  const both = "I would like some refreshments and some entertainment.";
  assert.equal(mergeSentence("", "", coffee), coffee);
  assert.equal(mergeSentence(coffee, coffee, both), both);
  assert.equal(mergeSentence(`Hi Sam. ${coffee} Thanks!`, coffee, both), `Hi Sam. ${both} Thanks!`);
  assert.equal(mergeSentence(`Hi Sam. ${coffee}`, coffee, ""), "Hi Sam.");
  assert.equal(mergeSentence("Can we go outside?", "", coffee), `Can we go outside? ${coffee}`);
  assert.equal(mergeSentence("Can we go outside?", "", ""), "Can we go outside?");
  assert.equal(mergeSentence(coffee, coffee, ""), "");
});

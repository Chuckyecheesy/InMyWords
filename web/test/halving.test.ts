/** Phase 6: alphabet-halving eye typing — pure logic. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALPHABET,
  describeLetters,
  dwellsPerLetter,
  narrow,
  splitLetters,
} from "../lib/input/halving.ts";

test("the alphabet includes space and splits into two non-empty halves", () => {
  assert.equal(ALPHABET.length, 27);
  const [first, second] = splitLetters(ALPHABET);
  assert.equal(first.length + second.length, 27);
  assert.ok(first.length > 0 && second.length > 0);
  assert.ok(Math.abs(first.length - second.length) <= 1);
});

test("any letter is reachable in at most dwellsPerLetter() choices", () => {
  assert.equal(dwellsPerLetter(), 5);
  for (const target of ALPHABET) {
    let remaining = ALPHABET;
    let steps = 0;
    while (remaining.length > 1) {
      const [first] = splitLetters(remaining);
      remaining = narrow(remaining, first.includes(target) ? "first" : "second");
      steps += 1;
      assert.ok(steps <= 5, `${target} took more than 5 steps`);
    }
    assert.equal(remaining[0], target);
  }
});

test("labels read naturally, including space", () => {
  assert.equal(describeLetters(["a", "b", "c", "m"]), "a to m");
  assert.equal(describeLetters(["y", "z"]), "y or z");
  assert.equal(describeLetters([" "]), "space");
  assert.equal(describeLetters(["z", " "]), "z or space");
});

test("narrowing keeps order and never loses letters", () => {
  const [first, second] = splitLetters(ALPHABET);
  assert.deepEqual([...first, ...second], ALPHABET);
  assert.deepEqual(narrow(ALPHABET, "first"), first);
  assert.deepEqual(narrow(ALPHABET, "second"), second);
});

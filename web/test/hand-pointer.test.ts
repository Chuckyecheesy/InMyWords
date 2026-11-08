import assert from "node:assert/strict";
import { test } from "node:test";
import { HandPointer, HoldSelector } from "../lib/input/hand-pointer.ts";

test("hand pointer mirrors, clamps, smooths, and clears on tracking loss", () => {
  const pointer = new HandPointer();
  const hand = Array.from({ length: 21 }, () => ({ x: .25, y: .5 }));
  assert.deepEqual(pointer.push(hand, 1000, 600), { x: 750, y: 300 });
  hand[8] = { x: .75, y: .5 };
  assert.deepEqual(pointer.push(hand, 1000, 600), { x: 575, y: 300 });
  assert.equal(pointer.push(null, 1000, 600), null);
  hand[8] = { x: -1, y: 2 };
  assert.deepEqual(pointer.push(hand, 1000, 600), { x: 999, y: 599 });
  hand[8] = { x: NaN, y: .5 };
  assert.equal(pointer.push(hand, 1000, 600), null);
});

test("hold requires a full second and cannot repeat until leaving", () => {
  const hold = new HoldSelector();
  assert.equal(hold.push("refreshments", 0).select, false);
  assert.equal(hold.push("refreshments", 999).select, false);
  assert.equal(hold.push("refreshments", 1000).select, true);
  assert.equal(hold.push("refreshments", 3000).select, false);
  hold.push(null, 3100);
  assert.equal(hold.push("refreshments", 3200).select, false);
  assert.equal(hold.push("refreshments", 4200).select, true);
});

test("loss and screen transitions require a fresh confirmation hold", () => {
  const hold = new HoldSelector();
  hold.push("review", 0);
  hold.push("review", 1000);
  hold.reset();
  assert.equal(hold.push("send", 1100).progress, 0);
  hold.push("send", 1800);
  hold.push(null, 1900);
  assert.equal(hold.push("send", 2000).progress, 0);
  assert.equal(hold.push("send", 2999).select, false);
  assert.equal(hold.push("send", 3000).select, true);
});

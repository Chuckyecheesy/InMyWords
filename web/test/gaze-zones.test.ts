import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BubbleMagnet,
  GAZE_DWELL_MS,
  GAZE_GRACE_MS,
  GAZE_SWITCH_MS,
  GazeLatch,
  categoryZone,
  classifyGazePoint,
  confirmZone,
  majorityZone,
  type ZoneRect,
} from "../lib/input/gaze-zones.ts";

const cards: ZoneRect[] = [
  { id: "refreshments", left: 0, right: 300, top: 100, bottom: 400 },
  { id: "entertainment", left: 340, right: 640, top: 100, bottom: 400 },
  { id: "family", left: 680, right: 980, top: 100, bottom: 400 },
];

test("category columns include the gap and follow the nearer center", () => {
  assert.equal(categoryZone({ x: 150, y: 200 }, cards), "refreshments");
  // Centers are 150 and 490; x=310 is still nearer the left card.
  assert.equal(categoryZone({ x: 310, y: 200 }, cards), "refreshments");
  assert.equal(categoryZone({ x: 330, y: 200 }, cards), "entertainment");
  assert.equal(categoryZone({ x: 830, y: 250 }, cards), "family");
});

test("category columns ignore looks above or beside the row", () => {
  const pad = (400 - 100) * 0.15;
  assert.equal(categoryZone({ x: 150, y: 100 - pad }, cards), "refreshments");
  assert.equal(categoryZone({ x: 150, y: 100 - pad - 1 }, cards), null);
  assert.equal(categoryZone({ x: 990, y: 200 }, cards), null);
  assert.equal(categoryZone({ x: -1, y: 200 }, cards), null);
});

test("confirm halves leave a dead zone in the middle", () => {
  assert.equal(confirmZone(419, 1000), "gaze:cancel");
  assert.equal(confirmZone(420, 1000), null);
  assert.equal(confirmZone(580, 1000), null);
  assert.equal(confirmZone(581, 1000), "gaze:confirm");
  assert.equal(confirmZone(Number.NaN, 1000), null);
});

test("an open confirm step ignores category columns", () => {
  assert.equal(classifyGazePoint(
    { x: 150, y: 200 },
    { viewportWidth: 1000, confirming: true, categories: cards, other: "say" },
  ), "gaze:cancel");
  assert.equal(classifyGazePoint(
    { x: 150, y: 20 },
    { viewportWidth: 1000, confirming: false, categories: cards, other: "say" },
  ), "say");
});

test("a close look snaps onto the bubble center and stays there", () => {
  const magnet = new BubbleMagnet();
  const first = magnet.snap({ x: 20, y: 140 }, cards);
  assert.deepEqual(first, { x: 150, y: 250, id: "refreshments" });
  for (const point of [{ x: 40, y: 180 }, { x: 260, y: 300 }, { x: 90, y: 220 }]) {
    const held = magnet.snap(point, cards);
    assert.equal(held.id, "refreshments");
    assert.deepEqual({ x: held.x, y: held.y }, { x: 150, y: 250 });
  }
});

test("a look that reaches the next bubble center is pulled there", () => {
  const magnet = new BubbleMagnet();
  magnet.snap({ x: 150, y: 250 }, cards);
  const moved = magnet.snap({ x: 490, y: 250 }, cards);
  assert.deepEqual(moved, { x: 490, y: 250, id: "entertainment" });
});

test("noise on the border does not flicker between bubbles", () => {
  const magnet = new BubbleMagnet();
  magnet.snap({ x: 150, y: 250 }, cards);
  const edge = magnet.snap({ x: 340, y: 250 }, cards);
  assert.equal(edge.id, "refreshments");
  assert.equal(edge.x, 150);
  const away = magnet.snap({ x: 1200, y: 20 }, cards);
  assert.equal(away.id, null);
  assert.equal(away.x, 1200);
});

test("a zone needs about three quarters of the recent samples", () => {
  assert.equal(majorityZone(["a", "a", "a", "b"]), "a");
  assert.equal(majorityZone(["a", "a", "b", "b"]), null);
  assert.equal(majorityZone(["a", "a", "a", null]), "a");
  assert.equal(majorityZone(["a", "a", null]), null);
});

test("steady gaze dwells for 2400ms after the switch wait and fires once", () => {
  const latch = new GazeLatch();
  let selected = 0;
  for (let now = 0; now <= GAZE_SWITCH_MS + GAZE_DWELL_MS; now += 100) {
    const choice = latch.push("refreshments", now);
    if (now < GAZE_SWITCH_MS) assert.equal(choice.target, null);
    if (choice.select) selected += 1;
  }
  assert.equal(selected, 1);
  assert.equal(latch.push("refreshments", GAZE_SWITCH_MS + GAZE_DWELL_MS + 500).select, false);
});

test("a short disagreement keeps dwell progress", () => {
  const latch = new GazeLatch(GAZE_DWELL_MS, 0, 0.75, GAZE_SWITCH_MS, GAZE_GRACE_MS);
  latch.push("refreshments", 0);
  const started = latch.push("refreshments", GAZE_SWITCH_MS);
  assert.equal(started.progress, 0);
  const midway = latch.push("refreshments", GAZE_SWITCH_MS + 1000);
  assert.ok(Math.abs(midway.progress - 1000 / GAZE_DWELL_MS) < 0.001);

  const away = latch.push(null, GAZE_SWITCH_MS + 1000 + 300);
  assert.equal(away.target, "refreshments");
  assert.ok(Math.abs(away.progress - 1000 / GAZE_DWELL_MS) < 0.001);

  const back = latch.push("refreshments", GAZE_SWITCH_MS + 1000 + 350);
  assert.equal(back.target, "refreshments");
  assert.ok(Math.abs(back.progress - 1000 / GAZE_DWELL_MS) < 0.001);
});

test("leaving longer than the grace period starts the dwell over", () => {
  const latch = new GazeLatch(GAZE_DWELL_MS, 0, 0.75, GAZE_SWITCH_MS, GAZE_GRACE_MS);
  latch.push("refreshments", 0);
  latch.push("refreshments", GAZE_SWITCH_MS);
  latch.push("refreshments", GAZE_SWITCH_MS + 1000);
  latch.push(null, GAZE_SWITCH_MS + 1000);
  const cleared = latch.push(null, GAZE_SWITCH_MS + 1000 + GAZE_GRACE_MS + 1);
  assert.equal(cleared.target, null);
  assert.equal(cleared.progress, 0);
  const returned = latch.push("refreshments", GAZE_SWITCH_MS + 1000 + GAZE_GRACE_MS + 50);
  assert.equal(returned.select, false);
  assert.equal(returned.progress, 0);
});

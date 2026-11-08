/** Gaze/gesture input layer: the pure logic (GAZE_GESTURE_PLAN §4). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DwellController, GestureDetector } from "../lib/input/controller.ts";
import { communicateSentences, startOnTouchGrid } from "../lib/input/profile.ts";
import { EventQueue } from "../lib/input/queue.ts";
import { GazeSmoother } from "../lib/input/smoothing.ts";
import type { InputProfile } from "../lib/input/types.ts";

const SCREEN = { width: 1000, height: 800 };

test("smoothing: median of recent points, off-screen dropped", () => {
  const smoother = new GazeSmoother();
  for (let i = 0; i < 9; i++) smoother.push({ x: 100 + i, y: 200 }, i * 33, SCREEN);
  smoother.push({ x: -50, y: 200 }, 300, SCREEN); // off-screen: ignored
  const point = smoother.current(310);
  assert.ok(point && Math.abs(point.x - 104) <= 1);
});

test("smoothing: a single large jump is dropped (blink)", () => {
  const smoother = new GazeSmoother();
  for (let i = 0; i < 10; i++) smoother.push({ x: 100, y: 200 }, i * 33, SCREEN);
  smoother.push({ x: 900, y: 200 }, 340, SCREEN); // >40% width jump
  const point = smoother.current(350);
  assert.ok(point && point.x === 100);
});

test("smoothing: gaze is lost after 1s without valid points", () => {
  const smoother = new GazeSmoother();
  smoother.push({ x: 100, y: 100 }, 0, SCREEN);
  assert.equal(smoother.lost(500), false);
  assert.equal(smoother.lost(1500), true);
  assert.equal(smoother.current(1500), null);
});

function gridController(dwellMs = 1000) {
  const ctl = new DwellController(dwellMs);
  ctl.registerTile({ id: "coffee", label: "coffee", x: 0, y: 0, width: 300, height: 300 });
  ctl.registerTile({ id: "tea", label: "tea", x: 400, y: 0, width: 300, height: 300 });
  ctl.registerTile({ id: "pause", label: "Pause", x: 0, y: 400, width: 300, height: 300, isPause: true });
  return ctl;
}

test("dwell: steady gaze fills the ring and selects exactly once", () => {
  const ctl = gridController(1000);
  const point = { x: 150, y: 150 };
  let selection = null;
  for (let t = 0; t <= 1400 && !selection; t += 30) selection = ctl.tick(point, t);
  assert.ok(selection);
  assert.equal(selection.tileId, "coffee");
  assert.ok(selection.holdMs >= 1000);
  // cooldown: staring on cannot double-select within 800ms
  let second = null;
  for (let t = 1400; t <= 2100; t += 30) second = ctl.tick(point, t) ?? second;
  assert.equal(second, null);
});

test("dwell: brief look-aways under 200ms do not reset the ring", () => {
  const ctl = gridController(1000);
  const on = { x: 150, y: 150 };
  const off = { x: 999, y: 799 };
  let selection = null;
  for (let t = 0; t <= 600; t += 30) ctl.tick(on, t);
  for (let t = 630; t <= 750; t += 30) ctl.tick(off, t); // 120ms away
  for (let t = 780; t <= 1600 && !selection; t += 30) selection = ctl.tick(on, t);
  assert.ok(selection && selection.tileId === "coffee");
});

test("dwell: looking away longer drains the ring back to idle", () => {
  const ctl = gridController(1000);
  const on = { x: 150, y: 150 };
  for (let t = 0; t <= 600; t += 30) ctl.tick(on, t);
  for (let t = 630; t <= 950; t += 30) ctl.tick(null, t); // 320ms lost
  const state = ctl.state(960);
  assert.notEqual(state.phase, "fixating");
});

test("dwell: the Pause tile pauses; resume returns to idle", () => {
  const ctl = gridController(500);
  const onPause = { x: 150, y: 550 };
  let selection = null;
  for (let t = 0; t <= 900 && !selection; t += 30) selection = ctl.tick(onPause, t);
  assert.ok(selection?.isPause);
  assert.equal(ctl.state(1000).phase, "paused");
  for (let t = 1000; t <= 2000; t += 30) assert.equal(ctl.tick({ x: 150, y: 150 }, t), null);
  ctl.resume();
  let after = null;
  for (let t = 2000; t <= 3000 && !after; t += 30) after = ctl.tick({ x: 150, y: 150 }, t);
  assert.ok(after && after.tileId === "coffee");
});

test("hit-testing: 10% padding counts near-misses; nearest centre wins overlaps", () => {
  const ctl = gridController();
  assert.equal(ctl.hitTest({ x: 315, y: 150 })?.id, "coffee"); // 15px past the edge
  assert.equal(ctl.hitTest({ x: 380, y: 150 })?.id, "tea"); // inside tea's padding, nearer tea
});

test("gestures: fires at >=0.7 score for >=80% of a 500ms window, then cools down", () => {
  const detector = new GestureDetector();
  let fired = null;
  for (let t = 0; t <= 600; t += 33) {
    fired = detector.push("Thumb_Up", 0.9, t) ?? fired;
  }
  assert.equal(fired, "Thumb_Up");
  // cooldown: nothing fires inside the 1s window
  let during = null;
  for (let t = 620; t <= 1100; t += 33) during = detector.push("Thumb_Up", 0.9, t) ?? during;
  assert.equal(during, null);
});

test("gestures: low scores and mixed frames never fire (hand-talking)", () => {
  const detector = new GestureDetector();
  const names = ["Thumb_Up", "Open_Palm", "Victory", null];
  let fired = null;
  for (let t = 0; t <= 3000; t += 33) {
    fired = detector.push(names[(t / 33) % 4 | 0], 0.6, t) ?? fired;
  }
  assert.equal(fired, null);
});

test("queue: flushes at 20 events and requeues failed batches", async () => {
  const sent: number[] = [];
  let fail = true;
  const queue = new EventQueue("marcus", async (events) => {
    if (fail) return false;
    sent.push(events.length);
    return true;
  });
  for (let i = 0; i < 5; i++) queue.add("gaze", "select", "coffee", "confirmed", { holdMs: 1000 });
  await queue.flush(); // fails -> requeued
  assert.equal(queue.pending(), 5);
  fail = false;
  await queue.flush();
  assert.equal(queue.pending(), 0);
  assert.deepEqual(sent, [5]);
});

const MARCUS_PROFILE: InputProfile = {
  resident_id: "marcus",
  preferred_select: "gaze",
  preferred_yes: "Thumb_Up",
  dwell_ms: 1045,
  rates: { gaze: 0.85, touch: 0.7, gesture: 0.93 },
  notes: ["In the evening, offer touch instead."],
  events_counted: 250,
  confidence: "high",
};

test("coach card: Marcus's worked example renders the right sentences", () => {
  const lines = communicateSentences(MARCUS_PROFILE, "Marcus");
  assert.ok(lines[0].includes("selects by looking"));
  assert.ok(lines.some((l) => l.includes("about 1 second")));
  assert.ok(lines.includes("A thumbs up means yes."));
  assert.ok(lines.some((l) => l.includes("evening")));
});

test("adaptive: evening note means the touch grid opens first in the evening", () => {
  assert.equal(startOnTouchGrid(MARCUS_PROFILE, new Date("2026-11-08T19:30:00")), true);
  assert.equal(startOnTouchGrid(MARCUS_PROFILE, new Date("2026-11-08T09:30:00")), false);
});

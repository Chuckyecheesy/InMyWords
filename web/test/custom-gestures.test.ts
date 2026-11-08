/** G8: personal gesture logic (GAZE_GESTURE_PLAN §G8). */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CustomGestureMatcher,
  normalizeLandmarks,
  sampleDistance,
  type Landmark,
} from "../lib/input/custom-gestures.ts";

/** A toy "pointing" hand: 21 landmarks along distinct directions. */
function hand(offsetX = 0, offsetY = 0, scale = 1, jitter = 0): Landmark[] {
  const points: Landmark[] = [];
  for (let i = 0; i < 21; i++) {
    const angle = (i / 21) * Math.PI;
    points.push({
      x: offsetX + scale * (Math.cos(angle) * (i / 21)) + jitter * ((i % 3) - 1) * 0.01,
      y: offsetY + scale * (Math.sin(angle) * (i / 21)),
      z: scale * 0.02 * i,
    });
  }
  return points;
}

/** A clearly different shape: a fist-like cluster. */
function fist(offsetX = 0, offsetY = 0, scale = 1): Landmark[] {
  const points: Landmark[] = [{ x: offsetX, y: offsetY, z: 0 }];
  for (let i = 1; i < 21; i++) {
    points.push({
      x: offsetX + scale * 0.1 * Math.cos(i),
      y: offsetY + scale * (0.3 + 0.05 * Math.sin(i * 2)),
      z: 0,
    });
  }
  return points;
}

test("normalization is invariant to position and hand size", () => {
  const base = normalizeLandmarks(hand(0, 0, 1))!;
  const moved = normalizeLandmarks(hand(0.4, 0.3, 1))!;
  const bigger = normalizeLandmarks(hand(0.1, 0.1, 2.5))!;
  assert.ok(sampleDistance(base, moved) < 0.01, "translation should not matter");
  assert.ok(sampleDistance(base, bigger) < 0.01, "distance from camera should not matter");
});

test("same shape matches; a different shape does not", () => {
  const samples = [0, 1, 2, 3, 4].map((j) => normalizeLandmarks(hand(0, 0, 1, j))!);
  const matcher = new CustomGestureMatcher([{ tile_label: "go outside", samples }]);
  assert.equal(matcher.matchFrame(hand(0.3, 0.2, 1.8, 2), null, 0), "go outside");
  assert.equal(matcher.matchFrame(fist(0.2, 0.2, 1), null, 0), null);
});

test("a confident built-in gesture owns the frame (no false triggers)", () => {
  const samples = [normalizeLandmarks(hand())!];
  const matcher = new CustomGestureMatcher([{ tile_label: "go outside", samples }]);
  assert.equal(matcher.matchFrame(hand(), "Thumb_Up", 0.9), null);
  assert.equal(matcher.matchFrame(hand(), "Thumb_Up", 0.4), "go outside");
  assert.equal(matcher.matchFrame(hand(), "None", 0.99), "go outside");
});

test("no gestures taught or no hand means no match", () => {
  const empty = new CustomGestureMatcher([]);
  assert.equal(empty.matchFrame(hand(), null, 0), null);
  const matcher = new CustomGestureMatcher([
    { tile_label: "go outside", samples: [normalizeLandmarks(hand())!] },
  ]);
  assert.equal(matcher.matchFrame(null, null, 0), null);
});

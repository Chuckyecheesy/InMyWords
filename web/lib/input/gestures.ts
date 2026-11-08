/**
 * MediaPipe Gesture Recognizer wrapper (GAZE_GESTURE_PLAN G4).
 * VIDEO mode, 1 hand, reading WebGazer's video element — ONE shared camera
 * stream, never a second getUserMedia. Client-side dynamic import only.
 * All processing stays on the device.
 */

"use client";

import { GestureDetector } from "./controller";
import { gazeVideoElement } from "./gaze";

export type FiredGesture = { name: string; score: number };

const MODEL_PATH = "/models/gesture_recognizer.task";
const WASM_LOCAL = "/models/wasm";
const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

let recognizer: { recognizeForVideo(video: HTMLVideoElement, ts: number): { gestures: { categoryName: string; score: number }[][] }; close(): void } | null = null;
let rafId: number | null = null;
let detector = new GestureDetector();
let listeners = new Set<(fired: FiredGesture) => void>();
let frameCount = 0;
let skipFrames = false;
let lastFpsCheck = 0;
let framesSinceCheck = 0;

export async function startGestures(): Promise<void> {
  if (recognizer) return;
  const vision = await import("@mediapipe/tasks-vision");
  let fileset;
  try {
    fileset = await vision.FilesetResolver.forVisionTasks(WASM_LOCAL);
  } catch {
    fileset = await vision.FilesetResolver.forVisionTasks(WASM_CDN);
  }
  recognizer = await vision.GestureRecognizer.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 1,
  });
  detector = new GestureDetector();
  loop();
}

export function stopGestures(): void {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
  recognizer?.close();
  recognizer = null;
}

/**
 * Screens that accept gestures subscribe; everywhere else nothing listens
 * (§4.4 — gestures are ignored on screens that don't opt in).
 */
export function onGesture(cb: (fired: FiredGesture) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function loop(): void {
  rafId = requestAnimationFrame(loop);
  if (!recognizer) return;

  frameCount += 1;
  if (skipFrames && frameCount % 2 === 1) return; // <15 fps -> every 2nd frame

  const video = gazeVideoElement();
  if (!video || video.readyState < 2) return;

  const now = performance.now();
  framesSinceCheck += 1;
  if (now - lastFpsCheck > 2000) {
    const fps = (framesSinceCheck / (now - lastFpsCheck)) * 1000;
    skipFrames = fps < 15;
    lastFpsCheck = now;
    framesSinceCheck = 0;
  }

  let top: { categoryName: string; score: number } | undefined;
  try {
    const result = recognizer.recognizeForVideo(video, now);
    top = result.gestures?.[0]?.[0];
  } catch {
    return; // one bad frame is not an event
  }

  const name = top && top.categoryName !== "None" ? top.categoryName : null;
  const fired = detector.push(name, top?.score ?? 0, now);
  if (fired) {
    for (const cb of listeners) cb({ name: fired, score: top?.score ?? 0 });
  }
}

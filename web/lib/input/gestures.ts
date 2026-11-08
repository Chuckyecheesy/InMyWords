/**
 * MediaPipe Gesture Recognizer wrapper (GAZE_GESTURE_PLAN G4).
 * VIDEO mode, 1 hand, reading WebGazer's video element, ONE shared camera
 * stream, never a second getUserMedia. Client-side dynamic import only.
 * All processing stays on the device.
 */

"use client";

import { GestureDetector } from "./controller";
import { CustomGestureMatcher, type Landmark, type TaughtGesture } from "./custom-gestures";
import { gazeVideoElement } from "./gaze";

export type FiredGesture = { name: string; score: number };

const MODEL_PATH = "/models/gesture_recognizer.task";
const WASM_LOCAL = "/models/wasm";
const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

type RecognizerResult = {
  gestures: { categoryName: string; score: number }[][];
  landmarks?: Landmark[][];
};

let recognizer: { recognizeForVideo(video: HTMLVideoElement, ts: number): RecognizerResult; close(): void } | null = null;
let rafId: number | null = null;
let detector = new GestureDetector();
let listeners = new Set<(fired: FiredGesture) => void>();
let customListeners = new Set<(tileLabel: string) => void>();
let customMatcher = new CustomGestureMatcher([]);
let customDetector = new GestureDetector();
let lastLandmarks: Landmark[] | null = null;
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
  // WebGazer's face-mesh build leaves an Emscripten `Module` on window.
  // GestureRecognizer reads `Module.noExitRuntime`, and that getter aborts
  // the face-mesh runtime. Replace the global before the recognizer
  // instantiates its own wasm. Face mesh keeps the object it closed over.
  const host = window as unknown as { Module?: unknown };
  host.Module = undefined;
  const options = {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" as const },
    runningMode: "VIDEO" as const,
    numHands: 1,
  };
  try {
    recognizer = await vision.GestureRecognizer.createFromOptions(fileset, options);
  } catch {
    // Some machines have no usable GPU delegate. CPU still reads the same camera.
    recognizer = await vision.GestureRecognizer.createFromOptions(fileset, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: "CPU" },
    });
  }
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
 * (§4.4, gestures are ignored on screens that don't opt in).
 */
export function onGesture(cb: (fired: FiredGesture) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// ---- G8: personal gestures ----

/** Load this resident's taught gestures into the recognition loop. */
export function setCustomGestures(gestures: TaughtGesture[]): void {
  customMatcher = new CustomGestureMatcher(gestures);
  customDetector = new GestureDetector();
}

/** Fires with the taught tile label after the 500ms hold rule. */
export function onCustomGesture(cb: (tileLabel: string) => void): () => void {
  customListeners.add(cb);
  return () => customListeners.delete(cb);
}

/** Latest frame's 21 hand landmarks, the teach screen captures these. */
export function latestLandmarks(): Landmark[] | null {
  return lastLandmarks;
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
    lastLandmarks = result.landmarks?.[0] ?? null;
  } catch {
    return; // one bad frame is not an event
  }

  const name = top && top.categoryName !== "None" ? top.categoryName : null;
  const fired = detector.push(name, top?.score ?? 0, now);
  if (fired) {
    for (const cb of listeners) cb({ name: fired, score: top?.score ?? 0 });
  }

  // G8: taught gestures run through the same 500ms-hold rule; frames a
  // built-in gesture owns are skipped inside matchFrame.
  if (customMatcher.hasGestures() && customListeners.size > 0) {
    const label = customMatcher.matchFrame(lastLandmarks, name, top?.score ?? 0);
    const firedCustom = customDetector.push(label, label ? 1 : 0, now);
    if (firedCustom) {
      for (const cb of customListeners) cb(firedCustom);
    }
  }
}

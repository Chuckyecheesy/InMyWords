/**
 * WebGazer wrapper (GAZE_GESTURE_PLAN G2). Client-side dynamic import ONLY , 
 * WebGazer touches `window` and the camera; importing it during server
 * rendering crashes the build. The camera starts only after consent.
 */

"use client";

import { GazeSmoother } from "./smoothing";
import type { GazePoint } from "./types";

type WebGazerInstance = {
  setRegression(name: string): WebGazerInstance;
  setGazeListener(cb: (data: { x: number; y: number } | null, ts: number) => void): WebGazerInstance;
  begin(): Promise<unknown>;
  end(): void;
  pause(): void;
  resume(): void;
  showVideoPreview(show: boolean): WebGazerInstance;
  showPredictionPoints(show: boolean): WebGazerInstance;
  showFaceOverlay(show: boolean): WebGazerInstance;
  showFaceFeedbackBox(show: boolean): WebGazerInstance;
  recordScreenPosition(x: number, y: number, type: string): void;
  clearData(): void;
  removeMouseEventListeners(): void;
  params: {
    showVideo: boolean;
    faceMeshSolutionPath: string;
    camConstraints: MediaStreamConstraints;
  };
};

// WebGazer defaults this to "./mediapipe/face_mesh", which is relative to
// the page URL. The files are copied next to webgazer.js by
// scripts/fetch-vision-assets.mjs, so point at that absolute path or
// begin() throws "t is not a function" and the camera never starts.
const FACE_MESH_PATH = "/models/mediapipe/face_mesh";

let webgazer: WebGazerInstance | null = null;
let smoother = new GazeSmoother();
let listeners = new Set<(point: GazePoint | null, lost: boolean) => void>();
let running = false;

export function isRunning(): boolean {
  return running;
}

async function loadWebGazer(): Promise<WebGazerInstance> {
  // Script tag, not a bundled import: WebGazer's TensorFlow dependency
  // chain breaks Next's static analysis. The dist build is served locally
  // from /models (copied by scripts/fetch-vision-assets.mjs) and attaches
  // itself to window.webgazer. The file sometimes comes back as a 500
  // while the server is busy, so a failed load is retried.
  const w = window as unknown as { webgazer?: WebGazerInstance };
  if (w.webgazer) return w.webgazer;
  let lastError: unknown = new Error("webgazer.js failed to load");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = attempt === 0 ? "/models/webgazer.js" : `/models/webgazer.js?retry=${attempt}`;
        script.onload = () => resolve();
        script.onerror = () => {
          script.remove();
          reject(new Error("webgazer.js failed to load"));
        };
        document.head.appendChild(script);
      });
      if (w.webgazer) return w.webgazer;
      lastError = new Error("webgazer.js loaded but window.webgazer is missing");
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  throw lastError;
}

/** Words for a failed camera start. Permission, missing device, and a busy camera each get their own line. */
export function cameraStartMessage(error: unknown): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Allow the camera for this site in the address bar, then try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera was found on this device.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The camera is busy in another app or tab. Close it, then try again.";
  }
  return "The camera could not start. Reload the page and try again.";
}

/** Start the camera + gaze model. Resolves once WebGazer is live. */
export async function startGaze(): Promise<void> {
  if (running) return;
  webgazer = await loadWebGazer();
  webgazer.params.faceMeshSolutionPath = FACE_MESH_PATH;
  // The built-in minimum of 320×240 plus facingMode rejects some real
  // cameras with OverconstrainedError before the preview ever appears.
  webgazer.params.camConstraints = { video: true, audio: false };
  webgazer
    .setRegression("ridge")
    .showVideoPreview(false)
    .showPredictionPoints(false)
    .showFaceOverlay(false)
    .showFaceFeedbackBox(false)
    .setGazeListener((data) => {
      const now = performance.now();
      smoother.push(
        data ? { x: data.x, y: data.y } : null,
        now,
        { width: window.innerWidth, height: window.innerHeight },
      );
      const point = smoother.current(now);
      const lost = smoother.lost(now);
      for (const cb of listeners) cb(point, lost);
    });
  try {
    await webgazer.begin();
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "NotFoundError") throw error;
    try {
      webgazer.end();
    } catch {
      /* begin failed before the stream existed */
    }
    await webgazer.begin();
  }
  running = true;
}

/** Stop everything and release the camera. Calibration is session-only. */
export function stopGaze(): void {
  try {
    webgazer?.end();
  } catch {
    /* webgazer.end can throw if the stream already closed */
  }
  webgazer = null;
  running = false;
  smoother.reset();
}

export function pauseGaze(): void {
  webgazer?.pause();
}

export function resumeGaze(): void {
  webgazer?.resume();
}

export function onGaze(cb: (point: GazePoint | null, lost: boolean) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** One calibration click at screen position (x, y), trains the ridge model. */
export function recordCalibrationPoint(x: number, y: number): void {
  webgazer?.recordScreenPosition(x, y, "click");
}

/** After calibration: stop learning from stray mouse movement (G2). */
export function freezeLearning(): void {
  try {
    webgazer?.removeMouseEventListeners();
  } catch {
    /* older webgazer builds lack this; calibration still works */
  }
}

export function clearCalibration(): void {
  webgazer?.clearData();
  smoother.reset();
}

/** The shared <video> element WebGazer created, MediaPipe reads this. */
export function gazeVideoElement(): HTMLVideoElement | null {
  return document.getElementById("webgazerVideoFeed") as HTMLVideoElement | null;
}

/** Latest smoothed point without subscribing. */
export function currentGaze(): GazePoint | null {
  return smoother.current(performance.now());
}

"use client";

import { GazeSmoother } from "./smoothing";
import type { GazePoint } from "./types";

type WebGazerInstance = {
  setRegression(name: string): WebGazerInstance;
  getTracker(): { getPositions(): number[][] | null };
  setGazeListener(cb: (data: GazePoint | null, ts: number) => void): WebGazerInstance;
  saveDataAcrossSessions(save: boolean): WebGazerInstance;
  begin(): Promise<unknown>;
  end(): void;
  stopVideo?(): void;
  pause(): void;
  resume(): Promise<unknown>;
  showVideoPreview(show: boolean): WebGazerInstance;
  showPredictionPoints(show: boolean): WebGazerInstance;
  showFaceOverlay(show: boolean): WebGazerInstance;
  showFaceFeedbackBox(show: boolean): WebGazerInstance;
  recordScreenPosition(x: number, y: number, type: string): void;
  clearData(): Promise<void>;
  removeMouseEventListeners(): void;
  params: { faceMeshSolutionPath: string; camConstraints?: MediaStreamConstraints };
};

let webgazer: WebGazerInstance | null = null;
const smoother = new GazeSmoother();
const listeners = new Set<(point: GazePoint | null, lost: boolean) => void>();
let loader: Promise<WebGazerInstance> | null = null;
let starting: Promise<void> | null = null;
let generation = 0;
let running = false;
let watchdog: ReturnType<typeof setInterval> | null = null;
let resident: string | null = null;
let calibrated = false;
let lastSampleAt = -Infinity;
let lastFaceAt = -Infinity;
let previousPositions: number[][] | null = null;
let activeStream: MediaStream | null = null;

export function isRunning(): boolean { return running; }
export function hasCalibration(id: string): boolean { return resident === id && calibrated; }
/** Switching resident invalidates calibration even when their camera is off. */
export async function resetForResident(id: string): Promise<void> {
  if (resident !== null && resident !== id) await clearCalibration();
}
export function completeCalibration(id: string): void {
  if (resident === id) calibrated = true;
}

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


async function loadWebGazer(): Promise<WebGazerInstance> {
  const w = window as unknown as { webgazer?: WebGazerInstance };
  if (w.webgazer) return w.webgazer;
  if (!loader) {
    loader = new Promise<WebGazerInstance>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/models/webgazer.js";
      const timeout = setTimeout(fail, 30000);
      function fail() {
        clearTimeout(timeout);
        script.remove();
        reject(new Error("Eye tracking could not load. Please try again."));
      }
      script.onerror = fail;
      script.onload = () => {
        clearTimeout(timeout);
        if (w.webgazer) resolve(w.webgazer);
        else fail();
      };
      document.head.appendChild(script);
    }).catch((error) => { loader = null; throw error; });
  }
  return loader;
}

function publishLoss(): void {
  const lost = performance.now() - lastSampleAt > 1000;
  for (const cb of listeners) cb(null, lost);
}

function releaseCamera(instance: WebGazerInstance | null): void {
  // Upstream end() removes DOM but does not stop the video tracks.
  const stream = gazeVideoElement()?.srcObject as MediaStream | null;
  for (const source of new Set([stream, activeStream])) {
    source?.getTracks().forEach((track) => track.stop());
  }
  activeStream = null;
  // Also handles a stream created before WebGazer attached its video DOM.
  try { instance?.stopVideo?.(); } catch { /* partial startup or already stopped */ }
  instance?.pause();
  try { instance?.removeMouseEventListeners(); instance?.end(); } catch { /* partial startup */ }
}

/** Serialize starts: late results from a cancelled start cannot own the camera. */
export function startGaze(residentId: string): Promise<void> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error("Use HTTPS or localhost and a browser with camera access."));
  }
  if (running && resident === residentId) return Promise.resolve();
  if (starting) {
    const requestedGeneration = generation;
    return starting.catch(() => {}).then(() => {
      if (requestedGeneration !== generation) throw new Error("Camera start cancelled.");
      return startGaze(residentId);
    });
  }
  const token = generation;
  const work = (async () => {
    const instance = await loadWebGazer();
    if (token !== generation) throw new Error("Camera start cancelled.");
    webgazer = instance;
    instance.params.faceMeshSolutionPath = "/models/mediapipe/face_mesh";
    instance.params.camConstraints = { video: true, audio: false };
    instance.saveDataAcrossSessions(false);
    if (resident !== residentId) {
      releaseCamera(running ? instance : null);
      running = false;
      if (watchdog) clearInterval(watchdog);
      watchdog = null;
      resident = residentId;
      await clearCalibration();
      instance.setRegression("ridge");
    }
    if (token !== generation) throw new Error("Camera start cancelled.");
    smoother.reset();
    lastSampleAt = performance.now();
    lastFaceAt = -Infinity;
    previousPositions = instance.getTracker().getPositions();
    instance.showVideoPreview(false).showPredictionPoints(false)
      .showFaceOverlay(false).showFaceFeedbackBox(false)
      .setGazeListener((data) => {
        if (token !== generation) return;
        const now = performance.now();
        const positions = instance.getTracker().getPositions();
        if (positions?.length && positions !== previousPositions) lastFaceAt = now;
        previousPositions = positions;
        const valid = data && Number.isFinite(data.x) && Number.isFinite(data.y)
          && data.x >= 0 && data.y >= 0 && data.x <= window.innerWidth && data.y <= window.innerHeight;
        if (valid) lastSampleAt = now;
        smoother.push(valid ? data : null, now, { width: window.innerWidth, height: window.innerHeight });
        // Missing frames never advance dwell using a cached position.
        for (const cb of listeners) cb(valid ? smoother.current(now) : null, now - lastSampleAt > 1000);
      });
    try {
      await instance.begin();
      activeStream = gazeVideoElement()?.srcObject as MediaStream | null;
      if (token !== generation) throw new Error("Camera start cancelled.");
      instance.removeMouseEventListeners();
      running = true;
      watchdog = setInterval(() => {
        if (performance.now() - lastSampleAt > 200) publishLoss();
      }, 100);
    } catch (error) {
      releaseCamera(instance);
      throw error;
    }
  })();
  starting = work.finally(() => { starting = null; });
  return starting;
}

/** Preserve resident calibration across routes while releasing the camera. */
export function stopGaze(): void {
  generation += 1;
  if (watchdog) clearInterval(watchdog);
  watchdog = null;
  releaseCamera(webgazer);
  running = false;
  smoother.reset();
  lastSampleAt = -Infinity;
  lastFaceAt = -Infinity;
  publishLoss();
}

export function pauseGaze(): void { webgazer?.pause(); }
export function resumeGaze(): void { void webgazer?.resume(); }
export function onGaze(cb: (point: GazePoint | null, lost: boolean) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
export function recordCalibrationPoint(x: number, y: number): boolean {
  // Before training there are no gaze predictions yet; face landmarks,
  // rather than predicted coordinates, establish calibration readiness.
  if (!running || performance.now() - lastFaceAt > 250) return false;
  webgazer?.recordScreenPosition(x, y, "click");
  return true;
}
export function resetGazeSamples(): void { smoother.reset(); lastSampleAt = -Infinity; }
export function freezeLearning(): void { webgazer?.removeMouseEventListeners(); }
export async function clearCalibration(): Promise<void> {
  calibrated = false;
  smoother.reset();
  await webgazer?.clearData();
}
export function gazeVideoElement(): HTMLVideoElement | null {
  return document.getElementById("webgazerVideoFeed") as HTMLVideoElement | null;
}
/** Check points must use fresh predictions from after the target appeared. */
export function currentGaze(since = 0): GazePoint | null {
  if (lastSampleAt <= since || performance.now() - lastSampleAt > 250) return null;
  return smoother.current(performance.now());
}

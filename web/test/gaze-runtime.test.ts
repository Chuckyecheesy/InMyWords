import "./register-dom.ts";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  startGaze, stopGaze, isRunning, onGaze, completeCalibration,
  hasCalibration, resetForResident, clearCalibration, recordCalibrationPoint, currentGaze,
} from "../lib/input/gaze.ts";
import { EventQueue } from "../lib/input/queue.ts";
import { GazeSmoother } from "../lib/input/smoothing.ts";

let callback: (data: { x: number; y: number } | null, ts: number) => void;
let positions: number[][] | null = null;
let begins = 0;
let stops = 0;
let clears = 0;
let records = 0;
let wait: Promise<void> | null = null;
let fail = false;
const instance = {
  params: { faceMeshSolutionPath: "" },
  setRegression() { return this; },
  saveDataAcrossSessions(value: boolean) { assert.equal(value, false); return this; },
  setGazeListener(cb: typeof callback) { callback = cb; return this; },
  showVideoPreview() { return this; }, showPredictionPoints() { return this; },
  showFaceOverlay() { return this; }, showFaceFeedbackBox() { return this; },
  getTracker() { return { getPositions: () => positions }; },
  async clearData() { clears++; },
  recordScreenPosition() { records++; },
  removeMouseEventListeners() {},
  pause() {}, async resume() {},
  async begin() {
    begins++;
    if (wait) await wait;
    if (fail) throw new Error("Camera permission denied");
    const video = document.createElement("video");
    video.id = "webgazerVideoFeed";
    Object.defineProperty(video, "srcObject", {
      value: { getTracks: () => [{ stop: () => { stops++; } }] },
    });
    document.body.appendChild(video);
  },
  end() { document.getElementById("webgazerVideoFeed")?.remove(); },
};
function setup() {
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia() {} } });
  Object.assign(window, { webgazer: instance });
  fail = false; wait = null; positions = null;
}
function emit(point: { x: number; y: number } | null) {
  positions = [[1, 2], [3, 4]];
  callback(point, 0);
}
afterEach(() => { stopGaze(); });

test("startup configures local assets, trains without predictions, keeps calibration across routes", async () => {
  setup();
  await startGaze("runtime-a");
  assert.equal(instance.params.faceMeshSolutionPath, "/models/mediapipe/face_mesh");
  assert.equal(isRunning(), true);
  assert.equal(recordCalibrationPoint(50, 50), false);
  emit(null); // face landmarks exist even before the regression has training data
  const before = records;
  assert.equal(recordCalibrationPoint(50, 50), true);
  assert.equal(records, before + 1);
  completeCalibration("runtime-a");
  const oldClears = clears;
  const oldStops = stops;
  stopGaze();
  assert.ok(stops > oldStops);
  await startGaze("runtime-a");
  assert.equal(clears, oldClears);
  assert.equal(hasCalibration("runtime-a"), true);
  await resetForResident("runtime-b");
  assert.equal(hasCalibration("runtime-a"), false);
  await startGaze("runtime-b");
  assert.equal(hasCalibration("runtime-a"), false);
  assert.equal(hasCalibration("runtime-b"), false);
  assert.ok(clears > oldClears);
  completeCalibration("runtime-b");
  await clearCalibration();
  assert.equal(hasCalibration("runtime-b"), false);
});

test("concurrent starts open one stream and cancellation releases late tracks", async () => {
  setup();
  let resolve!: () => void;
  wait = new Promise<void>((done) => { resolve = done; });
  const before = begins;
  const first = startGaze("runtime-c");
  const second = startGaze("runtime-c");
  await new Promise((done) => setTimeout(done, 0));
  assert.equal(begins, before + 1);
  stopGaze();
  const oldStops = stops;
  resolve();
  const results = await Promise.allSettled([first, second]);
  assert.ok(results.every((result) => result.status === "rejected"));
  assert.ok(stops > oldStops);
  assert.equal(isRunning(), false);
  wait = null;
  await startGaze("runtime-c");
  assert.equal(isRunning(), true);
});

test("camera denial can be retried and insecure contexts are rejected", async () => {
  setup();
  fail = true;
  await assert.rejects(startGaze("runtime-d"), /permission/);
  fail = false;
  await startGaze("runtime-d");
  stopGaze();
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
  await assert.rejects(startGaze("runtime-d"), /HTTPS/);
});

test("missing callbacks expire gaze and never replay cached coordinates", async () => {
  setup();
  await startGaze("runtime-e");
  const received: { point: unknown; lost: boolean }[] = [];
  const unsubscribe = onGaze((point, lost) => received.push({ point, lost }));
  emit({ x: 100, y: 100 });
  assert.ok(currentGaze());
  emit(null);
  assert.equal(received.at(-1)?.point, null);
  await new Promise((done) => setTimeout(done, 1150));
  assert.deepEqual(received.at(-1), { point: null, lost: true });
  assert.equal(currentGaze(), null);
  unsubscribe();
});

test("failed script loads can be retried", async () => {
  setup();
  delete (window as unknown as { webgazer?: unknown }).webgazer;
  const first = startGaze("runtime-f");
  await new Promise((done) => setTimeout(done, 0));
  const script = document.querySelector('script[src="/models/webgazer.js"]')!;
  script.dispatchEvent(new Event("error"));
  await assert.rejects(first, /could not load/);
  const second = startGaze("runtime-f");
  await new Promise((done) => setTimeout(done, 0));
  Object.assign(window, { webgazer: instance });
  document.querySelector('script[src="/models/webgazer.js"]')!.dispatchEvent(new Event("load"));
  await second;
  assert.equal(isRunning(), true);
});

test("queue retries thrown requests without mixing resident identities", async () => {
  let reject = true;
  const sent: string[] = [];
  const a = new EventQueue("a", async (events) => {
    if (reject) throw new Error("offline");
    sent.push(...events.map((event) => event.resident_id)); return true;
  });
  const b = new EventQueue("b", async (events) => {
    sent.push(...events.map((event) => event.resident_id)); return true;
  });
  a.add("gaze", "select", "coffee", "confirmed");
  await a.flush();
  assert.equal(a.pending(), 1);
  b.add("touch", "select", "tea", "confirmed");
  await b.flush();
  reject = false;
  await a.flush();
  assert.deepEqual(sent, ["b", "a"]);
});

test("smoothing rejects NaN and infinity", () => {
  const smoother = new GazeSmoother();
  for (const point of [{ x: NaN, y: 1 }, { x: 1, y: Infinity }]) {
    smoother.push(point, 10, { width: 1000, height: 1000 });
  }
  assert.equal(smoother.current(10), null);
});

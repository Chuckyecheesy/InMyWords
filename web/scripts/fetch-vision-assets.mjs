/**
 * Fetch the MediaPipe gesture model + WASM into public/models (gitignored,
 * ~36 MB). Runs automatically before dev/build; skips if already present.
 * Local-first so the demo never depends on a CDN over venue wifi.
 */

import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modelsDir = join(root, "public", "models");
const wasmDir = join(modelsDir, "wasm");
const modelPath = join(modelsDir, "gesture_recognizer.task");

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

mkdirSync(wasmDir, { recursive: true });

if (!existsSync(modelPath)) {
  console.log("[vision-assets] downloading gesture_recognizer.task (~8 MB)...");
  const response = await fetch(MODEL_URL);
  if (!response.ok) {
    console.error(`[vision-assets] model download failed: HTTP ${response.status}`);
    process.exit(0); // don't fail the build; gestures degrade to touch
  }
  writeFileSync(modelPath, Buffer.from(await response.arrayBuffer()));
}

const wasmSource = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
if (existsSync(wasmSource) && !existsSync(join(wasmDir, "vision_wasm_internal.wasm"))) {
  console.log("[vision-assets] copying MediaPipe WASM from node_modules...");
  cpSync(wasmSource, wasmDir, { recursive: true });
}

// WebGazer is loaded via a <script> tag at runtime (its TensorFlow
// dependency chain breaks the bundler), so serve the dist build locally.
const webgazerSource = join(root, "node_modules", "webgazer", "dist", "webgazer.js");
const webgazerTarget = join(modelsDir, "webgazer.js");
if (existsSync(webgazerSource) && !existsSync(webgazerTarget)) {
  console.log("[vision-assets] copying webgazer.js from node_modules...");
  cpSync(webgazerSource, webgazerTarget);
  const mediapipeDir = join(root, "node_modules", "webgazer", "dist", "mediapipe");
  if (existsSync(mediapipeDir)) {
    cpSync(mediapipeDir, join(modelsDir, "mediapipe"), { recursive: true });
  }
}

console.log("[vision-assets] ready");

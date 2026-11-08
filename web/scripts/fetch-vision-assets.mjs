/**
 * Required eye-tracking assets are copied before optional gesture downloads.
 * Recopy local distributions so upgrades and interrupted copies repair cleanly.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const models = join(root, "public", "models");
const dist = join(root, "node_modules", "webgazer", "dist");
const faceSource = join(dist, "mediapipe", "face_mesh");
mkdirSync(models, { recursive: true });
if (!existsSync(join(dist, "webgazer.js")) || !existsSync(faceSource)) {
  throw new Error("WebGazer distribution or face models missing. Run npm ci before dev/build.");
}
const assets = readdirSync(faceSource);
if (!assets.some((name) => name.endsWith(".wasm")) ||
    !assets.some((name) => name.endsWith(".data")) ||
    !assets.includes("face_mesh.js")) {
  throw new Error("WebGazer face model distribution is incomplete.");
}
for (const name of ["face_mesh.js", "face_mesh.binarypb", "face_mesh_solution_packed_assets.data", "face_mesh_solution_simd_wasm_bin.wasm", "face_mesh_solution_wasm_bin.wasm"]) {
  if (statSync(join(faceSource, name)).size === 0) throw new Error("Empty WebGazer asset: " + name);
}
cpSync(join(dist, "webgazer.js"), join(models, "webgazer.js"));
cpSync(join(dist, "mediapipe"), join(models, "mediapipe"), { recursive: true });
console.log("[vision-assets] eye tracking ready");

const wasm = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
if (existsSync(wasm)) cpSync(wasm, join(models, "wasm"), { recursive: true });
const model = join(models, "gesture_recognizer.task");
if (!existsSync(model) || statSync(model).size === 0) {
  try {
    const response = await fetch("https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task", {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length === 0) throw new Error("Empty model download");
    writeFileSync(model + ".tmp", data);
    renameSync(model + ".tmp", model);
  } catch (error) {
    console.warn("[vision-assets] gestures unavailable; eye tracking remains ready:", error.message);
  }
}

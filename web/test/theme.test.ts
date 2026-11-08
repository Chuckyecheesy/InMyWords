import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("../app/tokens.css", import.meta.url), "utf8");
const calm = css.match(/:root,\s*\[data-theme="calm"\]\s*\{([^}]+)\}/)![1];
const contrast = css.match(/\[data-theme="contrast"\]\s*\{([^}]+)\}/)![1];
function color(block: string, name: string): string {
  const match = block.match(new RegExp(`--${name}:\\s*(#[a-f0-9]{6})`, "i"));
  assert.ok(match, name);
  return match[1];
}
function luminance(hex: string): number {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function check(block: string, fg: string, bg: string, minimum = 4.5) {
  const values = [luminance(color(block, fg)), luminance(color(block, bg))].sort((a, b) => b - a);
  const ratio = (values[0] + 0.05) / (values[1] + 0.05);
  assert.ok(ratio >= minimum, `${fg} on ${bg}: ${ratio.toFixed(2)} < ${minimum}`);
}

test("sage text, action labels, and selection colors meet AA", () => {
  for (const surface of ["bg", "surface", "surface-2", "surface-3", "accent-soft", "accent-softer"]) {
    for (const ink of ["ink", "ink-2", "ink-3", "accent", "accent-strong"]) check(calm, ink, surface);
    check(calm, "focus", surface, 3);
  }
  check(calm, "on-accent", "accent");
  check(calm, "on-accent", "accent-strong");
  check(calm, "ink", "bg", 7);
  check(calm, "line-strong", "surface", 3);
  check(calm, "line-strong", "bg", 3);
});

test("source labels and status colors remain readable and distinct", () => {
  for (const source of ["resident", "staff", "emh", "document", "pattern", "task"]) {
    check(calm, `src-${source}`, `src-${source}-bg`);
  }
  for (const status of ["danger", "success"]) check(calm, status, `${status}-soft`);
  assert.notEqual(color(calm, "src-resident"), color(calm, "src-staff"));
});

test("high contrast and resident sizing remain intact", () => {
  check(contrast, "ink", "bg", 7);
  check(contrast, "ink", "surface", 7);
  for (const source of ["resident", "staff", "emh", "document", "pattern", "task"]) {
    check(contrast, `src-${source}`, `src-${source}-bg`, 7);
  }
  assert.match(calm, /--text-body: 22px/);
  assert.match(calm, /--tap-min: 64px/);
  assert.match(calm, /--tile-min: 148px/);
  assert.match(css, /\[data-text="large"\]/);
});

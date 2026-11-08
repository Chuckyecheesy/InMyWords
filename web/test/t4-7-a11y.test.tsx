/**
 * T4.7 (RED) frontend accessibility pass — resident screens.
 * Rules from CLAUDE.md: tap targets >= 64px, body text >= 22px, long-press
 * speaks any button label, one question at a time, high contrast.
 *
 * Run from web/:  npm test
 */
import "./register-dom.ts";
import React from "react";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, test } from "node:test";
void React;
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ConfirmQueue } from "../components/ConfirmQueue.tsx";
import { SpeakForMe } from "../components/SpeakForMe.tsx";
import { sampleResident } from "../lib/mock.ts";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const tokens = readFileSync(new URL("../app/tokens.css", import.meta.url), "utf8");

const realFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function recordFetch() {
  const urls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    urls.push(String(url));
    return new Response(JSON.stringify({ ok: true, audio_url: "/a.mp3", options: [] }), {
      status: 200,
    });
  }) as typeof fetch;
  return urls;
}

/** Last declaration of `prop` inside the rule(s) for exactly this selector. */
function rule(selector: string): string {
  const out: string[] = [];
  const re = /([^{}]+)\{([^}]*)\}/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    const sels = m[1].split(",").map((s) => s.trim());
    if (sels.includes(selector)) out.push(m[2]);
  }
  return out.join("\n");
}

function px(value: string): number | null {
  const v = value.trim();
  if (v === "var(--tap-min)") return 64;
  if (v === "var(--text-body)") return 22;
  const calc = v.match(/^calc\(var\(--text-body\)\s*\*\s*([\d.]+)\)$/);
  if (calc) return 22 * Number(calc[1]);
  const m = v.match(/^([\d.]+)px$/);
  return m ? Number(m[1]) : null;
}

function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function token(block: RegExp, name: string): string {
  const body = tokens.match(block)?.[0] ?? "";
  return body.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1] ?? "";
}

describe("T4.7 a11y — text size", () => {
  test("every font-size in the stylesheet is at least 22px", () => {
    const small: string[] = [];
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const size = m[2].match(/font-size:\s*([^;]+);/)?.[1];
      const value = size ? px(size) : null;
      if (value !== null && value < 22) small.push(`${m[1].trim()} -> ${size} (${value}px)`);
    }
    assert.deepEqual(small, []);
  });
});

describe("T4.7 a11y — tap targets", () => {
  for (const selector of [".big-button", ".choice-button", ".suggestion-line", ".contrast-toggle"]) {
    test(`${selector} is at least 64px tall`, () => {
      const height = rule(selector).match(/min-height:\s*([^;]+);/)?.[1];
      assert.ok(height, `${selector} has no min-height`);
      assert.ok((px(height) ?? 0) >= 64, `${selector} min-height ${height}`);
    });
  }
});

describe("T4.7 a11y — contrast", () => {
  test("calm theme body text is at least 7:1", () => {
    const calm = /:root,\s*\[data-theme="calm"\]\s*\{[^}]*\}/;
    assert.ok(ratio(token(calm, "ink"), token(calm, "paper")) >= 7);
  });
  test("every calm source label pair is at least 4.5:1", () => {
    const calm = /:root,\s*\[data-theme="calm"\]\s*\{[^}]*\}/;
    for (const name of ["voice", "staff", "record", "emh", "pattern"]) {
      const r = ratio(token(calm, name), token(calm, `${name}-bg`));
      assert.ok(r >= 4.5, `${name} ${r.toFixed(2)}`);
    }
  });
  test("high-contrast theme is at least 7:1", () => {
    const hc = /\[data-theme="contrast"\]\s*\{[^}]*\}/;
    assert.ok(ratio(token(hc, "ink"), token(hc, "paper")) >= 7);
  });
});

describe("T4.7 a11y — long-press speaks any button label", () => {
  test("Yes and No in the confirm queue speak when held", async () => {
    const urls = recordFetch();
    render(
      <ConfirmQueue
        residentName="Marcus"
        memories={[{ id: "1", type: "routine", content: "Has tea.", source: "inferred", source_date: null, status: "pending" } as never]}
      />,
    );
    const yes = screen.getByRole("button", { name: "Yes" });
    await act(async () => {
      fireEvent.pointerDown(yes, { button: 0 });
      await sleep(750);
      fireEvent.pointerUp(yes);
    });
    assert.ok(urls.some((u) => u.includes("/speak")), `no /speak call: ${urls}`);
    assert.ok(!urls.some((u) => u.includes("/confirm")), "a long press must not answer");
  });

  test("a suggestion line speaks its label when held, and every other button too", async () => {
    const urls = recordFetch();
    const marcus = sampleResident("marcus")!;
    render(<SpeakForMe resident={marcus} />);
    const buttons = screen.getAllByRole("button").filter((b) => !b.hasAttribute("disabled"));
    const silent: string[] = [];
    for (const b of buttons) {
      const before = urls.length;
      await act(async () => {
        fireEvent.pointerDown(b, { button: 0 });
        await sleep(700);
        fireEvent.pointerUp(b);
      });
      if (urls.length === before) silent.push(b.textContent ?? "?");
    }
    assert.deepEqual(silent, []);
  });
});

describe("T4.7 a11y — one question at a time", () => {
  test("the confirm queue shows a single question even with several waiting", () => {
    const mk = (id: string, content: string) =>
      ({ id, type: "routine", content, source: "inferred", source_date: null, status: "pending" }) as never;
    render(
      <ConfirmQueue
        residentName="Marcus"
        memories={[mk("1", "Has tea."), mk("2", "Likes bowling."), mk("3", "Walks at 4pm.")]}
      />,
    );
    assert.equal(screen.getAllByRole("article").length, 1);
  });
});

describe("T4.7 a11y — every resident button is wired for long-press", () => {
  for (const file of ["SpeakForMe", "ConfirmQueue", "ChoiceScreen"]) {
    test(`${file}: every BigButton and suggestion line has a long-press handler`, () => {
      const src = readFileSync(new URL(`../components/${file}.tsx`, import.meta.url), "utf8");
      const bad: string[] = [];
      for (const m of src.matchAll(/<BigButton\b[^>]*?>/gs)) {
        if (!m[0].includes("onLongPress")) bad.push(m[0].replace(/\s+/g, " ").slice(0, 60));
      }
      for (const m of src.matchAll(/<button\b[^>]*?>/gs)) {
        if (!m[0].includes("onPointerDown")) bad.push(m[0].replace(/\s+/g, " ").slice(0, 60));
      }
      assert.deepEqual(bad, []);
    });
  }
});

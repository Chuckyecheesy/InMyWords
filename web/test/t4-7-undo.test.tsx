/**
 * T4.7 (RED) undo for the confirm queue. A Yes/No is only held on screen
 * until the resident taps Next; Undo changes their mind before anything is
 * saved. No timers, so there is no time limit.
 */
import "./register-dom.ts";
import React from "react";

import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
void React;
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ConfirmQueue } from "../components/ConfirmQueue.tsx";

const realFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

const mk = (id: string, content: string) =>
  ({ id, type: "routine", content, source: "inferred", source_date: null, status: "pending" }) as never;
const MEMS = [mk("1", "Has tea."), mk("2", "Likes bowling.")];

function record(ok = true) {
  const calls: { url: string; body: unknown }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify({ ok }), { status: ok ? 200 : 500 });
  }) as typeof fetch;
  return calls;
}

describe("T4.7 undo — confirm queue", () => {
  test("Yes is held, not saved: Undo and Next appear", async () => {
    const calls = record();
    render(<ConfirmQueue residentName="Marcus" memories={MEMS} />);
    await userEvent.click(screen.getByRole("button", { name: "Yes" }));
    assert.ok(screen.getByRole("button", { name: "Undo" }));
    assert.ok(screen.getByRole("button", { name: "Next" }));
    assert.equal(calls.length, 0);
  });

  test("Undo returns to the same question and saves nothing", async () => {
    const calls = record();
    render(<ConfirmQueue residentName="Marcus" memories={MEMS} />);
    await userEvent.click(screen.getByRole("button", { name: "No" }));
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    assert.ok(screen.getByText("Has tea."));
    assert.ok(screen.getByRole("button", { name: "Yes" }));
    assert.equal(calls.length, 0);
  });

  test("Next saves exactly one answer and shows the next question", async () => {
    const calls = record();
    render(<ConfirmQueue residentName="Marcus" memories={MEMS} residentId="marcus" />);
    await userEvent.click(screen.getByRole("button", { name: "Yes" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => assert.ok(screen.getByText("Likes bowling.")));
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.endsWith("/memories/1/confirm"));
    assert.deepEqual(calls[0].body, { confirmed: true, resident_id: "marcus" });
  });

  test("a failed save keeps the answer and Undo available", async () => {
    record(false);
    render(<ConfirmQueue residentName="Marcus" memories={MEMS} />);
    await userEvent.click(screen.getByRole("button", { name: "Yes" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => assert.ok(screen.getByText(/did not save/i)));
    assert.ok(screen.getByRole("button", { name: "Undo" }));
  });
});

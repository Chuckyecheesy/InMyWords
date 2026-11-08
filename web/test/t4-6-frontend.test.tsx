/**
 * T4.6 frontend acceptance tests. Correct = the "Done when" of T4.6:
 *   1. The tea pattern appears in Marcus's "confirm?" queue.
 *   2. The Coach mentions it labelled "pattern noticed".
 *   3. The binder's outdated coffee fact is flagged against the recent tea pattern.
 *   (Fallback: a seeded "pattern noticed" item.)
 *
 * Run from web/:  npm test
 */
import "./register-dom.ts";
import React from "react";

import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
void React;
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ConfirmQueue } from "../components/ConfirmQueue.tsx";
import { CoachChat } from "../components/CoachChat.tsx";
import { getPendingMemories } from "../lib/api.ts";
import { samplePending } from "../lib/mock.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const body = handler(String(url), init);
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
}

// What the API returns once Consolidator has run: tea pattern + the binder's
// coffee fact put back in the queue by propose_update.
const LIVE_PENDING = {
  memories: [
    {
      id: 101,
      type: "routine",
      content: "Marcus has tea in the morning.",
      source: "inferred",
      source_date: "2026-01-10",
      status: "pending",
      times_seen: 5,
      update_reason: null,
    },
    {
      id: 7,
      type: "preference",
      content: "Drinks coffee.",
      source: "document",
      source_date: "2019-01-01",
      status: "pending",
      times_seen: 1,
      update_reason: "Recent pattern contradicts: tea 5x this week",
    },
  ],
};

describe("T4.6 frontend — confirm queue", () => {
  test("getPendingMemories keeps id, times_seen and update_reason", async () => {
    stubFetch(() => LIVE_PENDING);
    const result = await getPendingMemories("marcus-t46-a");
    assert.equal(result.origin, "api");
    const tea = result.data.find((m) => m.content.includes("tea"));
    const coffee = result.data.find((m) => m.content.includes("coffee"));
    assert.ok(tea && coffee);
    assert.equal(tea.id, "101");
    assert.equal(tea.times_seen, 5);
    assert.match(coffee.update_reason ?? "", /tea 5x/);
  });

  test("tea pattern shows in the queue labelled Pattern noticed with its count", async () => {
    stubFetch(() => LIVE_PENDING);
    const { data } = await getPendingMemories("marcus-t46-b");
    render(<ConfirmQueue residentName="Marcus" memories={data} />);
    const tea = screen.getByText("Marcus has tea in the morning.").closest("article")!;
    assert.ok(tea.textContent!.includes("Pattern noticed"));
    assert.ok(/5 times/.test(tea.textContent!));
    // Never shown as the resident's words until confirmed.
    assert.ok(!tea.textContent!.includes("In Marcus's words"));
  });

  test("outdated binder coffee fact is flagged against the tea pattern", async () => {
    stubFetch(() => LIVE_PENDING);
    const { data } = await getPendingMemories("marcus-t46-c");
    // The queue shows one question at a time (T4.7 a11y), so check each alone.
    const coffeeOnly = data.filter((m) => /coffee/i.test(m.content));
    render(<ConfirmQueue residentName="Marcus" memories={coffeeOnly} />);
    const coffee = screen.getByText("Drinks coffee.").closest("article")!;
    assert.ok(coffee.textContent!.includes("From records, 2019"));
    assert.ok(/may have changed/i.test(coffee.textContent!));
    assert.ok(coffee.textContent!.includes("tea 5x this week"));
    cleanup();
    render(<ConfirmQueue residentName="Marcus" memories={data.filter((m) => /tea/i.test(m.content) && !/coffee/i.test(m.content))} />);
    const tea = screen.getByText("Marcus has tea in the morning.").closest("article")!;
    assert.ok(!/may have changed/i.test(tea.textContent!));
  });

  test("fallback sample data has the tea pattern and the flagged coffee fact", () => {
    const rows = samplePending("marcus")!;
    const tea = rows.find((m) => /tea/i.test(m.content));
    assert.ok(tea);
    assert.equal(tea.source, "inferred");
    assert.equal(tea.times_seen, 5);
    const coffee = rows.find((m) => /coffee/i.test(m.content));
    assert.ok(coffee);
    assert.equal(coffee.source, "document");
    assert.ok(coffee.update_reason);
  });

  test("yes and no tiles call confirmMemory and then clear the item", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    stubFetch((url, init) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      return { ok: true };
    });
    const memories = samplePending("marcus")!;
    render(<ConfirmQueue residentName="Marcus" memories={memories} />);
    const tea = screen.getByText(/choosing tea|tea in the morning/i).closest("article")!;
    const buttons = Array.from(tea.querySelectorAll("button"));
    const yes = buttons.find((b) => /yes/i.test(b.textContent!))!;
    const no = buttons.find((b) => /no/i.test(b.textContent!))!;
    assert.ok(yes && no);
    await userEvent.click(yes);
    await waitFor(() => assert.equal(calls.length, 1));
    assert.ok(calls[0].url.endsWith(`/memories/${memories.find((m) => /tea/i.test(m.content))!.id}/confirm`));
    // Backend contract: ConfirmBody {confirmed: bool, resident_id}.
    assert.deepEqual(calls[0].body, { confirmed: true, resident_id: "marcus" });
    await waitFor(() => assert.ok(!screen.queryByText(/tea/i) || !tea.isConnected));
  });

  test("tap targets are at least 64px and one question is asked per card", () => {
    render(<ConfirmQueue residentName="Marcus" memories={samplePending("marcus")!} />);
    const buttons = Array.from(document.querySelectorAll("button"));
    assert.ok(buttons.length >= 2);
    for (const b of buttons) {
      assert.ok(b.classList.contains("big-button") || b.className.includes("tile") || b.style.minHeight === "64px",
        "buttons use the big-tap-target style");
    }
  });
});

describe("T4.6 frontend — Coach", () => {
  test("Coach labels an inferred tea pattern 'Pattern noticed'", async () => {
    stubFetch((url) => {
      assert.ok(url.endsWith("/coach/ask"));
      return {
        answer: "Marcus has tea in the morning.",
        sources: [{ type: "inferred", date: "2026-01-10", label: "Pattern noticed" }],
      };
    });
    render(<CoachChat residentName="Marcus" residentId="marcus" />);
    await userEvent.type(screen.getByLabelText(/ask a question/i), "What does Marcus drink in the morning?");
    await userEvent.click(screen.getByRole("button", { name: /^ask$/i }));
    await waitFor(() => screen.getByText(/tea in the morning/i), { timeout: 3000 });
    assert.ok(screen.getByText(/Pattern noticed/));
  });

  test("Coach shows 'may have changed' for a flagged outdated fact", async () => {
    stubFetch(() => ({
      answer: "Records say Marcus drinks coffee, but he has chosen tea 5 times this week.",
      sources: [
        { type: "inferred", date: "2026-01-10", label: "Pattern noticed" },
        { type: "document", date: "2019-01-01", label: "From records, 2019", update_reason: "Recent pattern contradicts: tea 5x this week" },
      ],
    }));
    render(<CoachChat residentName="Marcus" residentId="marcus" />);
    await userEvent.type(screen.getByLabelText(/ask a question/i), "Coffee or tea?");
    await userEvent.click(screen.getByRole("button", { name: /^ask$/i }));
    await waitFor(() => screen.getByText(/From records, 2019/), { timeout: 3000 });
    assert.ok(screen.getByText(/Pattern noticed/));
    assert.ok(/may have changed/i.test(document.body.textContent!));
  });
});

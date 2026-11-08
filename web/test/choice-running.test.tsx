/**
 * Choice subagents and approved steps: show a moving ellipsis while they
 * run, then the output they produced.
 */
import "./register-dom.ts";
import React from "react";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import { mock } from "node:test";
void React;
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ApprovalCard } from "../components/ApprovalCard.tsx";
import { ChoiceScreen } from "../components/ChoiceScreen.tsx";
import { RunningEllipsis } from "../components/RunningEllipsis.tsx";
import type { ActionPlan } from "../lib/api.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  mock.timers.reset();
});

const PLAN: ActionPlan = {
  plan_id: 7,
  goal: "Herb garden",
  online_steps: [{ step: "book_activity", detail: "Herb garden at the nursery", cost: 22 }],
  staff_tasks: [],
  total_cost: 22,
  status: "proposed",
  agents: [
    { id: "observer", name: "Observer", note: "Dana chose Herb garden." },
    { id: "retriever", name: "Retriever", note: "Nothing saved about this yet." },
    { id: "routine", name: "Routine finder", note: "No regular pattern yet." },
    { id: "action", name: "Action", note: "Book it." },
  ],
};

test("ellipsis cycles . .. ... in the stylesheet", () => {
  render(<RunningEllipsis />);
  assert.ok(document.querySelector(".running-ellipsis"));
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /@keyframes running-ellipsis/);
  assert.match(css, /content:\s*"\.";/);
  assert.match(css, /content:\s*"\.\.";/);
  assert.match(css, /content:\s*"\.\.\.";/);
});

test("week choice shows the subagents running, then their notes", async () => {
  globalThis.fetch = (async (url: string) => {
    const path = String(url);
    if (path.includes("/actions/plan")) {
      const running = document.querySelector("[data-testid='steps-running']");
      assert.match(running?.textContent ?? "", /The steps are running/);
      assert.ok(running?.querySelector(".running-ellipsis"));
      assert.equal(document.querySelector("[data-testid='agent-running']")?.getAttribute("data-running"), "");
      assert.equal(document.querySelector("[data-agent='observer']")?.textContent?.includes("Dana chose"), false);
      return Response.json({
        plan_id: PLAN.plan_id,
        goal: PLAN.goal,
        online_steps: PLAN.online_steps,
        staff_tasks: PLAN.staff_tasks,
        total_cost: PLAN.total_cost,
        status: "proposed",
        agents: PLAN.agents,
      });
    }
    if (path.includes("/decide")) return Response.json({ ok: true, status: "chosen" });
    if (path.includes("/choices")) {
      return Response.json({
        id: 4,
        question: "What would you like to do this week?",
        weekly_budget: 60,
        status: "not_yet_decided",
        options: [
          {
            label: "Herb garden",
            photo: null,
            cost: 22,
            money_left: 38,
            consequence: "You would choose Herb garden. Costs $22. $38 left this week.",
          },
          {
            label: "not decided yet",
            photo: null,
            cost: 0,
            money_left: 60,
            consequence: "That's okay. We can come back to this. Costs $0. $60 left this week.",
          },
        ],
      });
    }
    return Response.json({ ok: true });
  }) as typeof fetch;

  render(<ChoiceScreen residentId="dana" residentName="Dana" />);
  fireEvent.click(await screen.findByRole("button", { name: "Herb garden", exact: true }));

  const showcase = await screen.findByTestId("agent-showcase");
  assert.equal(screen.queryByTestId("steps-running"), null);
  assert.match(showcase.querySelector("[data-agent='observer']")?.textContent ?? "", /Dana chose Herb garden/);
  assert.match(showcase.querySelector("[data-agent='retriever']")?.textContent ?? "", /Nothing saved about this yet/);
});

test("approved steps show a moving ellipsis, then the step output", async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes("/approve")) {
      await gate;
      return Response.json({
        status: "done",
        results: [{ step: "book_activity", result: "Booked: Herb garden" }],
      });
    }
    return Response.json({ ok: true, status: "cancelled" });
  }) as typeof fetch;

  render(
    <React.StrictMode>
      <ApprovalCard residentId="dana" plan={PLAN} />
    </React.StrictMode>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  assert.equal(screen.getByTestId("approval-note").textContent, "Approved. You can still cancel.");

  mock.timers.tick(5000);
  await act(async () => {
    await Promise.resolve();
  });
  assert.match(screen.getByTestId("approval-note").textContent ?? "", /^The steps are running$/);
  assert.ok(screen.getByTestId("approval-note").querySelector(".running-ellipsis"));
  assert.equal(screen.queryByTestId("step-results"), null);

  release();
  await act(async () => {
    await gate;
  });
  assert.equal(screen.getByTestId("approval-note").textContent, "The steps are done.");
  assert.equal(screen.getByTestId("step-results").textContent, "Booked: Herb garden");
});

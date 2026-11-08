/**
 * T4.7 (RED) frontend acceptance tests — staff side.
 * Done when: activity log shows actions, choices and sentences with times,
 * and the action plan from /actions/plan is read in its real shape.
 * Expected to FAIL until components/ActivityLog.tsx exists and
 * planActions() normalises online_steps / staff_tasks.
 *
 * Run from web/:  npm test
 */
import "./register-dom.ts";
import React from "react";

import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
void React;
import { cleanup, render, screen } from "@testing-library/react";

import { ActivityLog } from "../components/ActivityLog.tsx";
import { planActions } from "../lib/api.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

const ITEMS = [
  { kind: "sentence", created_at: "2026-11-06T09:12:00", text: "Spoke: 'Can I get a double-double?'", status: "approved" },
  { kind: "action", created_at: "2026-11-06T14:33:00", text: "Approved plan: book lane, calendar, email Lisa", status: "approved" },
  { kind: "choice", created_at: "2026-11-06T14:30:00", text: "Chose bowling over movie", status: "chosen" },
] as const;

describe("T4.7 — Activity log", () => {
  test("lists sentences, choices and actions, each with a time", () => {
    render(<ActivityLog items={[...ITEMS]} residentName="Marcus" />);
    for (const label of ["Sentence", "Choice", "Action"]) {
      assert.ok(screen.getAllByText(label).length >= 1, label);
    }
    assert.equal(screen.getAllByRole("time").length, 3);
  });

  test("newest first", () => {
    render(<ActivityLog items={[...ITEMS]} residentName="Marcus" />);
    const rows = screen.getAllByRole("article").map((r) => r.textContent ?? "");
    assert.match(rows[0], /Approved plan/);
    assert.match(rows[2], /double-double/);
  });

  test("never says staff decided; undecided choice reads 'Not decided yet'", () => {
    render(
      <ActivityLog
        items={[{ kind: "choice", created_at: "2026-11-06T10:00:00", text: "Movie or bowling", status: "not_yet_decided" }]}
        residentName="Marcus"
      />,
    );
    assert.ok(screen.getByText(/Not decided yet/));
    assert.equal(screen.queryByText(/staff decided/i), null);
  });

  test("empty log shows a calm message", () => {
    render(<ActivityLog items={[]} residentName="Marcus" />);
    assert.ok(screen.getByText(/Nothing has been logged yet/));
  });
});

describe("T4.7 — planActions reads the real /actions/plan shape", () => {
  test("returns online_steps, staff_tasks and total_cost", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          plan_id: 501,
          goal: "bowling Saturday",
          online_steps: [{ step: "book_activity", detail: "Lane, 2pm", cost: 15 }],
          staff_tasks: [{ task: "Drive Marcus to KW Bowl", due: "Saturday 1:30pm" }],
          total_cost: 15,
          status: "proposed",
        }),
        { status: 200 },
      )) as typeof fetch;
    const result = await planActions({ resident_id: "marcus", goal: "bowling Saturday" });
    assert.ok(result.ok);
    const plan = result.data;
    assert.equal(plan.plan_id, 501);
    assert.equal(plan.online_steps.length, 1);
    assert.equal(plan.staff_tasks[0].task, "Drive Marcus to KW Bowl");
    assert.equal(plan.total_cost, 15);
  });
});

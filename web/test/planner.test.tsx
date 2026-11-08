/**
 * My Planner (PROJECT_PLAN §2.5): the resident sets a routine one question at
 * a time, approves it on a card, and only then is it saved and booked.
 *
 * Run from web/:  npm test
 */
import "./register-dom.ts";
import React from "react";

import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
void React;
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { MyPlanner } from "../components/MyPlanner.tsx";
import {
  clock,
  daysPhrase,
  groupByDay,
  hourBounds,
  hourLabel,
  layoutDay,
  lengthLabel,
  localDate,
  routineSentence,
  timeRange,
  weekFrom,
  weekStartOf,
  type PlannerVisit,
} from "../lib/planner.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

type Call = { path: string; body: Record<string, unknown> | null };

function stubApi(handler: (path: string, body: Record<string, unknown> | null) => unknown): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^.*?(\/planner|\/speak)/, "$1");
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ path, body });
    return new Response(JSON.stringify(handler(path, body) ?? {}), { status: 200 });
  }) as typeof fetch;
  return calls;
}

function visit(day: string, over: Partial<PlannerVisit> = {}): PlannerVisit {
  return {
    id: 1,
    staff: "sam",
    starts_at: `${day}T13:00:00-05:00`,
    ends_at: `${day}T15:00:00-05:00`,
    source: "resident",
    label: "In Dana's words",
    approved: true,
    google_synced: true,
    ...over,
  };
}

const WEEK = ["08", "09", "10", "11", "12", "13", "14"].map((d) => visit(`2026-11-${d}`));
const STAFF = [
  { id: "sam", name: "Sam" },
  { id: "jordan", name: "Jordan" },
];

function planner(props: Partial<React.ComponentProps<typeof MyPlanner>> = {}) {
  return render(
    <MyPlanner
      residentId="dana"
      residentName="Dana"
      initialVisits={[]}
      staff={STAFF}
      today="2026-11-08"
      cancelWindowMs={20}
      {...props}
    />,
  );
}

function tap(name: string | RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
}

/** Answer the four questions: Sam, 1:00p.m., 2 hours, every day. */
async function answerAll() {
  tap("Add a visit");
  assert.ok(screen.getByRole("heading", { name: "Who do you want to see?" }));
  tap(/Sam/);
  assert.ok(screen.getByRole("heading", { name: "What time?" }));
  tap("1:00p.m.");
  assert.ok(screen.getByRole("heading", { name: "For how long?" }));
  tap("2 hours");
  assert.ok(screen.getByRole("heading", { name: "Which days?" }));
  tap("Every day");
  await screen.findByRole("heading", { name: "Meet Sam at 1:00p.m. for 2 hours, every day." });
}

const PREVIEW = { visits: WEEK.map(({ staff, starts_at, ends_at }) => ({ staff, starts_at, ends_at })) };

describe("planner helpers", () => {
  test("times read the spec's way, in Toronto", () => {
    assert.equal(clock("2026-11-08T13:00:00-05:00"), "1:00p.m.");
    assert.equal(clock("2026-11-08T18:00:00Z"), "1:00p.m.", "UTC shown as local time");
    assert.equal(timeRange("2026-11-08T13:00:00-05:00", "2026-11-08T15:00:00-05:00"), "1:00p.m.–3:00p.m.");
    assert.equal(clock("2026-11-08T09:30:00-05:00"), "9:30a.m.");
    assert.equal(clock("2026-11-08T12:00:00-05:00"), "12:00p.m.");
  });

  test("a late visit belongs to its local day, not the UTC day", () => {
    assert.equal(localDate("2026-11-09T03:00:00Z"), "2026-11-08");
  });

  test("a week is seven days from today, across the DST change", () => {
    const week = weekFrom("2026-10-29");
    assert.equal(week.length, 7);
    assert.deepEqual(week.map((d) => d.date).slice(2, 5), ["2026-10-31", "2026-11-01", "2026-11-02"]);
    assert.equal(weekFrom("2026-11-08")[0].heading, "Sunday, November 8");
    assert.equal(weekFrom("2026-11-08", 1)[0].date, "2026-11-15");
  });

  test("visits land under their day, earliest first", () => {
    const later = visit("2026-11-09", { starts_at: "2026-11-09T16:00:00-05:00", ends_at: "2026-11-09T17:00:00-05:00" });
    const byDay = groupByDay([later, WEEK[1], WEEK[0]], weekFrom("2026-11-08"));
    assert.equal(byDay.get("2026-11-08")?.length, 1);
    assert.deepEqual(byDay.get("2026-11-09")?.map((v) => clock(v.starts_at)), ["1:00p.m.", "4:00p.m."]);
  });

  test("calendar weeks start on Sunday", () => {
    assert.equal(weekStartOf("2026-11-08"), "2026-11-08");
    assert.equal(weekStartOf("2026-11-11"), "2026-11-08");
    assert.equal(weekStartOf("2026-11-14"), "2026-11-08");
  });

  test("the grid shows 8a.m.–8p.m., widened to fit early or late events", () => {
    const week = weekFrom("2026-11-08");
    assert.deepEqual(hourBounds(WEEK, week), { first: 8, last: 20 });
    const early = visit("2026-11-09", { starts_at: "2026-11-09T06:30:00-05:00", ends_at: "2026-11-09T07:00:00-05:00" });
    const late = visit("2026-11-10", { starts_at: "2026-11-10T21:00:00-05:00", ends_at: "2026-11-10T22:15:00-05:00" });
    assert.deepEqual(hourBounds([early, late], week), { first: 6, last: 23 });
    const nextWeek = visit("2026-11-20", { starts_at: "2026-11-20T05:00:00-05:00", ends_at: "2026-11-20T06:00:00-05:00" });
    assert.deepEqual(hourBounds([nextWeek], week), { first: 8, last: 20 }, "other weeks don't stretch this one");
    assert.equal(hourLabel(9), "9a.m.");
    assert.equal(hourLabel(12), "12p.m.");
    assert.equal(hourLabel(13), "1p.m.");
  });

  test("overlapping events share the column side by side; others get full width", () => {
    const bounds = { first: 8, last: 20 };
    const at = (start: string, end: string, title: string) =>
      visit("2026-11-09", { starts_at: `2026-11-09T${start}:00-05:00`, ends_at: `2026-11-09T${end}:00-05:00`, title });
    const placed = layoutDay(
      [at("13:00", "15:00", "A"), at("14:00", "16:00", "B"), at("14:30", "15:00", "C"), at("17:00", "18:00", "D")],
      "2026-11-09", bounds);
    const by = Object.fromEntries(placed.map((p) => [p.visit.title, p]));
    assert.deepEqual([by.A.lane, by.B.lane, by.C.lane], [0, 1, 2]);
    assert.ok([by.A, by.B, by.C].every((p) => p.lanes === 3));
    assert.deepEqual([by.D.lane, by.D.lanes], [0, 1]);
    const reuse = layoutDay([at("13:00", "14:00", "E"), at("13:30", "15:00", "F"), at("14:00", "15:00", "G")], "2026-11-09", bounds);
    const r = Object.fromEntries(reuse.map((p) => [p.visit.title, p]));
    assert.equal(r.G.lane, 0, "G reuses E's lane once E has ended");
    assert.equal(r.G.lanes, 2);
  });

  test("events running past the grid are clipped to it", () => {
    const placed = layoutDay(
      [visit("2026-11-09", { starts_at: "2026-11-09T19:00:00-05:00", ends_at: "2026-11-10T01:00:00-05:00" })],
      "2026-11-09", { first: 8, last: 20 });
    assert.equal(Math.round(placed[0].top + placed[0].height), 100);
  });

  test("the approval sentence", () => {
    assert.equal(routineSentence("Sam", "13:00", 120, null), "Meet Sam at 1:00p.m. for 2 hours, every day.");
    assert.equal(daysPhrase(["mon", "wed"]), "on Monday and Wednesday");
    assert.equal(lengthLabel(90), "1 hour 30 minutes");
    assert.equal(lengthLabel(30), "30 minutes");
  });
});

describe("My week", () => {
  test("a Sunday-to-Saturday calendar with 1:00p.m.–3:00p.m. blocks placed by time", () => {
    const { container } = planner({ initialVisits: WEEK });
    const days = screen.getAllByRole("listitem");
    assert.equal(days.length, 7);
    assert.match(days[0].getAttribute("aria-label") ?? "", /^Today, Sunday, November 8: 1 visit$/);
    const ranges = [...container.querySelectorAll(".cal-event .visit-time")].map((el) => el.textContent);
    assert.deepEqual(ranges, Array(7).fill("1:00p.m.–3:00p.m."));
    assert.equal(screen.getAllByText("Meeting with Sam").length, 7);
    assert.equal(container.querySelectorAll(".visit-synced-icon").length, 7);
    const legend = container.querySelector(".cal-legend")?.textContent ?? "";
    assert.match(legend, /Your visits: In Dana's words/, "the source label is always on screen");
    const labels = [...container.querySelectorAll(".cal-event")].map((el) => el.getAttribute("aria-label") ?? "");
    assert.ok(labels.every((l) => l.includes("In Dana's words") && l.includes("on Sam's calendar")));
    // 8a.m.–8p.m. grid: 1pm is 5/12 down, a 2h block is 2/12 tall.
    const block = container.querySelector(".cal-event") as HTMLElement;
    assert.equal(parseFloat(block.style.top).toFixed(2), ((5 / 12) * 100).toFixed(2));
    assert.equal(parseFloat(block.style.height).toFixed(2), ((2 / 12) * 100).toFixed(2));
    assert.match(block.getAttribute("aria-label") ?? "", /1:00p\.m\.–3:00p\.m\., Meeting with Sam, In Dana's words/);
    assert.equal(container.querySelectorAll(".cal-hour").length, 12);
  });

  test("a long visit has room for its source label inline", () => {
    const { container } = planner({
      initialVisits: [visit("2026-11-09", { starts_at: "2026-11-09T09:00:00-05:00", ends_at: "2026-11-09T13:00:00-05:00" })],
    });
    assert.equal(container.querySelector(".cal-event .visit-label")?.textContent, "In Dana's words");
  });

  test("a short event shows its title (its time is its place on the grid)", () => {
    const { container } = planner({
      initialVisits: [visit("2026-11-09", { read_only: true, title: "Breakfast", source: "staff",
                                            label: "From staff calendar, 2026-11-08",
                                            starts_at: "2026-11-09T07:00:00-05:00", ends_at: "2026-11-09T07:30:00-05:00" })],
    });
    const block = container.querySelector(".cal-event") as HTMLElement;
    assert.equal(block.dataset.short, "true");
    assert.equal(block.textContent, "Breakfast");
    assert.match(block.getAttribute("aria-label") ?? "", /^7:00a\.m\.–7:30a\.m\., Breakfast/);
  });

  test("all-day events sit in their own strip, not on the hour grid", () => {
    const { container } = planner({
      initialVisits: [visit("2026-11-12", { all_day: true, starts_at: "2026-11-12T00:00:00-05:00",
                                            ends_at: "2026-11-13T00:00:00-05:00" })],
    });
    assert.ok(container.querySelector(".cal-allday .cal-chip"));
    assert.equal(container.querySelectorAll(".cal-day .cal-event").length, 0);
  });

  test("visits still waiting for approval are not shown as booked", () => {
    planner({ initialVisits: [visit("2026-11-08", { approved: false })] });
    assert.equal(screen.queryAllByText("1:00p.m.–3:00p.m.").length, 0);
  });

  test("next week moves the seven days on", () => {
    planner();
    tap("Next week");
    assert.ok(screen.getByText("November 15 – November 21"));
    assert.equal(screen.queryByText("Today"), null);
    tap("This week");
    assert.ok(screen.getByText("November 8 – November 14"));
  });
});

describe("setting a routine", () => {
  test("one question at a time, then a card that saves nothing yet (rule 1)", async () => {
    const calls = stubApi((path) => (path === "/planner/preview" ? PREVIEW : {}));
    planner();
    await answerAll();
    assert.deepEqual(calls.map((c) => c.path), ["/planner/preview"]);
    assert.deepEqual(calls[0].body, {
      resident_id: "dana", person: "sam", start: "13:00", length_min: 120, days: null, start_date: "2026-11-08",
    });
    assert.ok(screen.getByText("Nothing is booked until you approve."));
    assert.equal((await screen.findAllByText("1:00p.m.–3:00p.m.")).length, 7);
  });

  test("approve, wait out the cancel window, then save and book", async () => {
    const calls = stubApi((path) => {
      if (path === "/planner/preview") return PREVIEW;
      if (path === "/planner/routine") return { routine_id: 4, visits: [] };
      if (path === "/planner/book") return { visits: WEEK, google_synced: true, planner: "gemini" };
      if (path.startsWith("/planner/dana")) return { visits: WEEK, staff: STAFF };
      return {};
    });
    planner();
    await answerAll();
    tap("Approve");
    assert.ok(screen.getByText("Approved. You can still cancel."));
    assert.ok(!calls.some((c) => c.path === "/planner/routine"), "nothing saved during the window");
    await screen.findByText("Booked. It is on Sam's calendar.");
    const book = calls.find((c) => c.path === "/planner/book");
    assert.deepEqual(book?.body, { resident_id: "dana", routine_id: 4, approved: true });
    const order = calls.map((c) => c.path);
    assert.ok(order.indexOf("/planner/routine") < order.indexOf("/planner/book"));
    tap("Back to my week");
    assert.equal(screen.getAllByText("Meeting with Sam").length, 7);
  });

  test("cancel during the window is a real undo: nothing is saved or booked", async () => {
    const calls = stubApi((path) => (path === "/planner/preview" ? PREVIEW : {}));
    planner({ cancelWindowMs: 200 });
    await answerAll();
    tap("Approve");
    tap("Cancel");
    assert.ok(screen.getByText("Cancelled. Nothing was booked."));
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(calls.map((c) => c.path), ["/planner/preview"]);
  });

  test("a calendar that is down still books in the app, and says so plainly", async () => {
    stubApi((path) => {
      if (path === "/planner/preview") return PREVIEW;
      if (path === "/planner/routine") return { routine_id: 5, visits: [] };
      if (path === "/planner/book") return { visits: WEEK, google_synced: false, planner: "rules" };
      return { visits: WEEK, staff: STAFF };
    });
    planner();
    await answerAll();
    tap("Approve");
    await screen.findByText("Booked. Sam can see it here in My Planner.");
  });

  test("a refusal from the server books nothing and says why", async () => {
    stubApi((path) => {
      if (path === "/planner/preview") return PREVIEW;
      if (path === "/planner/routine") return { error: "unknown staff 'sam'" };
      return {};
    });
    planner();
    await answerAll();
    tap("Approve");
    await screen.findByText(/Nothing was booked\. unknown staff/);
    assert.ok(screen.getByRole("button", { name: "Approve" }), "can try again");
  });

  test("choose days: Done waits for a pick, then only those days are asked for", async () => {
    const calls = stubApi(() => PREVIEW);
    planner();
    tap("Add a visit");
    tap(/Sam/);
    tap("1:00p.m.");
    tap("2 hours");
    tap("Choose days");
    const done = screen.getByRole("button", { name: "Done" }) as HTMLButtonElement;
    assert.equal(done.disabled, true);
    tap("Monday");
    tap("Wednesday");
    assert.equal(screen.getByRole("button", { name: "Monday" }).getAttribute("aria-pressed"), "true");
    tap("Done");
    await screen.findByRole("heading", { name: "Meet Sam at 1:00p.m. for 2 hours, on Monday and Wednesday." });
    assert.deepEqual(calls[0].body?.days, ["mon", "wed"]);
  });

  test("Back goes one question back without losing the resident's place", () => {
    planner();
    tap("Add a visit");
    tap(/Sam/);
    tap("Back");
    assert.ok(screen.getByRole("heading", { name: "Who do you want to see?" }));
    assert.equal(screen.getByRole("button", { name: /Sam/ }).getAttribute("aria-pressed"), "true");
  });

  test("every choice is a real button (long-press reads it aloud)", () => {
    planner();
    tap("Add a visit");
    for (const button of screen.getAllByRole("button")) {
      assert.equal(button.tagName, "BUTTON");
    }
  });
});

describe("fallback: a staff calendar file", () => {
  test("shows imported times read-only, labelled as staff's, without booking", async () => {
    const calls = stubApi(() => ({
      visits: [{ title: "Visit Dana", starts_at: "2026-11-09T13:00:00-05:00", ends_at: "2026-11-09T15:00:00-05:00",
                 source: "staff", label: "From staff calendar, 2026-11-08", read_only: true }],
      read_only: true,
    }));
    const { container } = planner();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([80, 75, 3, 4])], "takeout.zip", { type: "application/zip" });
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText("1 staff visit times shown. Nothing was booked or sent.");
    await waitFor(() => assert.ok(container.querySelector('.visit-block[data-kind="imported"]')));
    const legend = container.querySelector(".cal-legend")?.textContent ?? "";
    assert.match(legend, /From staff calendar, 2026-11-08 \(shown only, not booked\)/);
    const block = container.querySelector('.cal-event[data-kind="imported"]') as HTMLElement;
    assert.match(block.getAttribute("aria-label") ?? "", /Visit Dana, From staff calendar, 2026-11-08/);
    assert.deepEqual(calls.map((c) => c.path), ["/planner/import"]);
    assert.equal(typeof calls[0].body?.calendar_zip_b64, "string");
    assert.equal(calls[0].body?.start_date, "2026-11-08", "the window starts at this week's Sunday");
    assert.equal(calls[0].body?.days, 63);
  });
});

describe("calendar scroll position", () => {
  test("localHour reads Toronto time", async () => {
    const { localHour } = await import("../lib/planner.ts");
    assert.equal(localHour("2026-11-08T13:00:00-05:00"), 13);
    assert.equal(localHour("2026-11-08T18:00:00Z"), 13);
  });
});

import { expect, test } from "@playwright/test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WeekView } from "../components/MyPlanner";
import type { PlannerVisit } from "../lib/planner";

const visits: PlannerVisit[] = [
  {
    id: 1,
    staff: "jordan",
    starts_at: "2026-11-08T10:00:00-05:00",
    ends_at: "2026-11-08T11:00:00-05:00",
    source: "resident",
    label: "In Marcus's words",
    approved: true,
    google_synced: false,
    status: "pending",
  },
  {
    id: null,
    staff: "jordan",
    starts_at: "2026-11-09T10:00:00-05:00",
    ends_at: "2026-11-09T10:30:00-05:00",
    source: "staff",
    label: "From staff calendar",
    approved: false,
    google_synced: false,
    read_only: true,
    title: "Breakfast with Jordan",
  },
];

for (const viewer of ["resident", "staff"] as const) {
  for (const textSize of ["default", "large"] as const) {
    test(`${viewer} calendar displays event titles and one-hour time at ${textSize} text size`, async ({ page }) => {
      const markup = renderToStaticMarkup(React.createElement(WeekView, {
        viewer,
        residentName: "Marcus",
        today: "2026-11-08",
        weekOffset: 0,
        setWeekOffset: () => {},
        visits,
        staff: [{ id: "jordan", name: "Jordan" }],
        importNote: null,
        onCalendarFile: () => {},
      }));
      await page.setViewportSize({ width: 1186, height: 768 });
      await page.setContent(markup);
      await page.addStyleTag({ path: "app/tokens.css" });
      await page.addStyleTag({ path: "app/globals.css" });
      if (textSize === "large") {
        await page.locator("html").evaluate((html) => html.setAttribute("data-text", "large"));
      }

      for (const [selector, text] of [
        [".visit-what", "Meeting with Jordan"],
        [".visit-what", "Breakfast with Jordan"],
        [".visit-time", "10:00a.m.–11:00a.m."],
      ]) {
        const content = page.locator(`.visit-block ${selector}`, { hasText: text });
        await expect(content).toHaveText(text);
        const fullyVisible = await content.evaluate((element) => {
          const event = element.closest(".visit-block")!;
          const range = document.createRange();
          range.selectNodeContents(element);
          const text = range.getBoundingClientRect();
          const bounds = event.getBoundingClientRect();
          return text.top >= bounds.top && text.bottom <= bounds.bottom &&
            text.left >= bounds.left && text.right <= bounds.right;
        });
        expect(fullyVisible, `${text} should fit within its event block`).toBe(true);
      }
    });
  }
}

import { expect, test } from "@playwright/test";

test("Coach returns a sourced overview for an onboarding question", async ({ page }) => {
  await page.goto("/staff/marcus/coach");
  await page.getByLabel("Ask a question").fill("Explain Marcus's onboarding");

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/coach/ask") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();

  const body = (await response.json()) as {
    answer: string;
    sources: { type: string; date: string; label: string }[];
  };
  // The natural-wording Coach (PR #23) phrases sources inline but freely
  // ("From the 2021 records, ..."), so assert semantics, not exact strings.
  expect(body.answer).not.toContain("I don't know");
  expect(body.answer).toMatch(/records/i);
  expect(body.answer).toMatch(/In Marcus's words/i);
  expect(body.sources.length).toBeGreaterThan(0);

  await expect(page.locator(".msg-a").last()).toContainText(/records/i, { timeout: 15_000 });
});

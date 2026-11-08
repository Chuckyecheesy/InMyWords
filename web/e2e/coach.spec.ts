import { expect, test } from "@playwright/test";

test("Coach returns a sourced overview for an onboarding question", async ({ page }) => {
  await page.goto("/staff/marcus/coach");
  await page.getByLabel("Ask a question").fill("Explain Marcus's onboarding");

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/coach/ask") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Ask" }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();

  const body = (await response.json()) as {
    answer: string;
    sources: { type: string; date: string; label: string }[];
  };
  expect(body.answer).not.toContain("I don't know");
  expect(body.answer).toContain("From records, 2021:");
  expect(body.answer).toContain("In Marcus's words:");
  expect(body.answer).toContain("Bowling on Saturday");
  expect(body.sources.some((source) => source.type === "document")).toBeTruthy();

  await expect(page.locator(".coach-answer").last()).toContainText(
    "From records, 2021",
  );
});

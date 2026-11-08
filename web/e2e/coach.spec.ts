import { expect, test } from "@playwright/test";

test("Coach returns a sourced overview for an onboarding question", async ({ page }) => {
  await page.goto("/staff/marcus/coach");
  await page.getByLabel("Ask a question").fill("Explain Marcus's onboarding");

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/coach/ask") &&
      response.request().method() === "POST",
  );
  // "Ask by voice" also matches a substring name of "Ask".
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();

  const body = (await response.json()) as {
    answer: string;
    sources: { type: string; date: string; label: string }[];
  };
  // Spoken wording (coach_wording): sources sit in the sentence, not as
  // "From records, 2021:" labels. Onboarding pulls communication facts.
  expect(body.answer).not.toContain("I don't know");
  expect(body.answer).toContain("In Marcus's words");
  expect(body.answer).toContain("From the 2021 records");
  expect(body.sources.some((source) => source.type === "document")).toBeTruthy();

  await expect(page.getByText("From the 2021 records")).toBeVisible();
});

import { expect, test } from "@playwright/test";

/**
 * T3.7 in the browser: a choice opens an approval card with a cancel window,
 * a pending pattern can be confirmed with yes or no, and one of three voices
 * can be played and chosen.
 */

test.describe("T3.7 approval, confirm, voice", () => {
  test("Bowling opens an approval card that can still be cancelled", async ({ page }) => {
    const created = page.waitForResponse(
      (response) =>
        response.url().includes("/choices") &&
        response.request().method() === "POST" &&
        !response.url().includes("/decide"),
    );
    await page.goto("/resident/marcus/choice");
    expect((await created).ok()).toBeTruthy();

    const planned = page.waitForResponse((response) => response.url().includes("/actions/plan"));
    await page.getByRole("button", { name: "Bowling" }).click();
    const plan = await (await planned).json();
    expect(plan.total_cost).toBe(15);
    expect(plan.online_steps.map((step: { step: string }) => step.step)).toEqual([
      "book_activity",
      "add_to_calendar",
      "send_message",
    ]);

    const card = page.getByTestId("approval-card");
    await expect(card).toBeVisible();
    await expect(card.getByText("Total $15.")).toBeVisible();
    const booking = card.locator("[data-step='book_activity']");
    await expect(booking).toBeVisible();
    await expect(booking.locator("img, .choice-letter").first()).toBeVisible();
    await expect(card.getByText("Drive Marcus to KW Bowl")).toBeVisible();

    const approveBox = await card.getByRole("button", { name: "Approve" }).boundingBox();
    expect(approveBox?.width).toBeGreaterThanOrEqual(64);
    expect(approveBox?.height).toBeGreaterThanOrEqual(64);

    await card.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByTestId("approval-note")).toHaveText("Approved. You can still cancel.");

    const cancelled = page.waitForResponse((response) => response.url().includes("/cancel"));
    await card.getByRole("button", { name: "Cancel" }).click();
    const decision = await cancelled;
    expect(decision.request().url()).toContain("resident_id=marcus");
    await expect(page.getByTestId("approval-note")).toHaveText("Cancelled. Nothing was booked.");
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
  });

  test("leaving the cancel window runs the plan", async ({ page }) => {
    const created = page.waitForResponse(
      (response) =>
        response.url().includes("/choices") &&
        response.request().method() === "POST" &&
        !response.url().includes("/decide"),
    );
    await page.goto("/resident/marcus/choice");
    expect((await created).ok()).toBeTruthy();
    await page.getByRole("button", { name: "Bowling" }).click();
    const card = page.getByTestId("approval-card");
    await expect(card).toBeVisible();
    const approved = page.waitForResponse((response) => response.url().includes("/approve"));
    await card.getByRole("button", { name: "Approve" }).click();
    const response = await approved;
    expect(response.request().url()).toContain("resident_id=marcus");
    await expect(page.getByTestId("approval-note")).toHaveText("Approved. The steps are running.");
  });

  test("Marcus confirms the tea pattern with a yes tile", async ({ page }) => {
    await page.goto("/resident/marcus/confirm");
    await expect(page.getByRole("heading", { name: "Pattern noticed, confirm?" })).toBeVisible();
    await expect(page.getByText("Likes tea now", { exact: false })).toBeVisible();
    await expect(page.getByText("Pattern noticed", { exact: true })).toBeVisible();

    const yes = page.getByRole("button", { name: "Yes" });
    const box = await yes.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(64);
    expect(box?.height).toBeGreaterThanOrEqual(64);

    const saved = page.waitForResponse((response) => response.url().includes("/confirm"));
    await yes.click();
    const response = await saved;
    expect(response.request().postDataJSON()).toEqual({
      confirmed: true,
      resident_id: "marcus",
    });
    expect(response.request().url()).toContain("/memories/101/confirm");
    await expect(page.getByText("In Marcus's words.")).toBeVisible();
  });

  test("three voice previews play and one can be chosen", async ({ page }) => {
    await page.goto("/resident/marcus/voice");
    await expect(page.getByRole("heading", { name: "Choose a voice" })).toBeVisible();
    await expect(page.locator("[data-voice]")).toHaveCount(3);

    const spoken = page.waitForResponse(
      (response) => response.url().includes("/speak") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Play Voice 2" }).click();
    expect((await spoken).request().postDataJSON()).toMatchObject({
      resident_id: "marcus",
      text: "Hi, I'm Marcus. I like bowling on Saturdays.",
    });

    const saved = page.waitForResponse((response) => response.request().method() === "PUT");
    await page.getByRole("button", { name: "Choose Voice 2" }).click();
    const choice = await saved;
    expect(choice.request().url()).toContain("/residents/marcus/voice");
    expect(choice.request().postDataJSON()).toEqual({ voice_id: "8PwRt92JyKWDUj6ZJxvm" });
    await expect(page.getByTestId("voice-choice")).toHaveText("Marcus chose Voice 2.");
  });
});

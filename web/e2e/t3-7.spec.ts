import { expect, test } from "@playwright/test";

/**
 * T3.7 in the browser: a choice opens an approval card with a cancel window,
 * a pending pattern can be confirmed with yes or no, and one of three voices
 * can be played and chosen.
 */

/** Live Gemini can hiccup under rate limits; the UI shows Try again —
 *  use it once, like a resident would, before failing the test. */
async function openApprovalCard(
  page: import("@playwright/test").Page,
  card: import("@playwright/test").Locator,
) {
  try {
    await card.waitFor({ state: "visible", timeout: 30_000 });
  } catch {
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await card.waitFor({ state: "visible", timeout: 45_000 });
  }
}

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
    await page.getByRole("button", { name: "Bowling", exact: true }).click();
    const plan = await (await planned).json();
    expect(plan.total_cost).toBe(15);
    // Gemini proposes the plan (code grounds it), so step composition can
    // vary — the booking is the demo-critical invariant.
    const steps = plan.online_steps.map((step: { step: string }) => step.step);
    expect(steps).toContain("book_activity");
    expect(steps.length).toBeGreaterThanOrEqual(2);

    const card = page.getByTestId("approval-card");
    await openApprovalCard(page, card);
    await expect(card.getByText("Total $15.")).toBeVisible();
    const booking = card.locator("[data-step='book_activity']");
    await expect(booking).toBeVisible();
    await expect(booking.locator("img, .choice-letter").first()).toBeVisible();
    await expect(card.getByText(/KW Bowl/).first()).toBeVisible();
    await expect(page.getByTestId("agent-showcase")).toBeVisible();

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
    await page.getByRole("button", { name: "Bowling", exact: true }).click();
    const card = page.getByTestId("approval-card");
    await openApprovalCard(page, card);
    const approved = page.waitForResponse((response) => response.url().includes("/approve"));
    await card.getByRole("button", { name: "Approve" }).click();
    const response = await approved;
    expect(response.request().url()).toContain("resident_id=marcus");
    await expect(page.getByTestId("approval-note")).toHaveText("Approved. The steps are running.");
  });

  test("Marcus confirms the tea pattern with a yes tile", async ({ page }) => {
    // ConfirmQueue HOLDS the answer until Next (undo-able), then saves.
    // Mode-agnostic: works against the live database or the mock fallback.
    // The queue shows one item at a time, newest first — the memory wiring
    // can slot fresher observations ahead of the tea pattern, so confirm
    // through (bounded) until the tea card is up.
    await page.goto("/resident/marcus/confirm");
    for (let i = 0; i < 8; i++) {
      const teaVisible = await page
        .getByText("Likes tea now", { exact: false })
        .isVisible()
        .catch(() => false);
      if (teaVisible) break;
      await page.getByRole("button", { name: "Yes" }).click();
      await page.getByRole("button", { name: "Next" }).click();
      await page.waitForTimeout(400);
    }
    await expect(page.getByText("Likes tea now", { exact: false })).toBeVisible();

    const yes = page.getByRole("button", { name: "Yes" });
    const box = await yes.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(64);
    expect(box?.height).toBeGreaterThanOrEqual(64);
    await yes.click();
    await expect(page.getByText("You said Yes.")).toBeVisible();

    const saved = page.waitForResponse((response) =>
      /\/memories\/\d+\/confirm/.test(response.url()),
    );
    await page.getByRole("button", { name: "Next" }).click();
    const response = await saved;
    expect(response.request().postDataJSON()).toMatchObject({
      confirmed: true,
      resident_id: "marcus",
    });
  });

  test("three voice previews play and one can be chosen", async ({ page }) => {
    // VoicePicker redesign: previews play client-side from preview_url
    // (no /speak POST); cards are .voice-card.
    await page.goto("/resident/marcus/voice");
    await expect(page.getByRole("heading", { name: "Choose a voice" })).toBeVisible();
    await expect(page.locator(".voice-card")).toHaveCount(3, { timeout: 20_000 });

    await page.getByRole("button", { name: "Play Voice 2" }).click();
    await expect(page.locator("audio")).toHaveAttribute("src", /.+/);

    const saved = page.waitForResponse((response) => response.request().method() === "PUT");
    await page.getByRole("button", { name: "Choose Voice 2" }).click();
    const choice = await saved;
    expect(choice.request().url()).toContain("/residents/marcus/voice");
    expect(choice.request().postDataJSON()).toEqual({ voice_id: "8PwRt92JyKWDUj6ZJxvm" });
    await expect(page.getByTestId("voice-choice")).toHaveText("Marcus chose Voice 2.");
  });
});

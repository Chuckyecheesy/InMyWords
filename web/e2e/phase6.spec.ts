import { expect, test } from "@playwright/test";

/** Roadmap Phase 6: advanced access & staff help. */

test("get staff help: resident confirms, staff see the banner and acknowledge", async ({ page }) => {
  await page.goto("/resident/marcus");
  await page.getByRole("button", { name: "Get staff help", exact: true }).click();
  await expect(page.getByText("It is not for emergencies.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Yes, please come", exact: true }).click();
  await expect(page.getByText("Asking staff now…")).toBeVisible();

  await page.goto("/staff");
  const banner = page.locator(".urgent-banner");
  await expect(banner).toBeVisible({ timeout: 15000 });
  await expect(banner.getByText("Marcus asked for help.").first()).toBeVisible();
  await banner.getByRole("button", { name: "I'm coming" }).first().click();
  await expect(banner.getByText("Marcus asked for help.")).toHaveCount(0, { timeout: 10000 });
});

test("get staff help: No, go back makes no request", async ({ page }) => {
  await page.goto("/resident/dana");
  await page.getByRole("button", { name: "Get staff help", exact: true }).click();
  await page.getByRole("button", { name: "No, go back", exact: true }).click();
  await expect(page.getByRole("button", { name: "Get staff help", exact: true })).toBeVisible();
});

test("one finger mode widens targets from the Display menu", async ({ page }) => {
  await page.goto("/resident/marcus/type");
  await page.getByRole("button", { name: "Display settings", exact: true }).click();
  await page.getByRole("button", { name: "One finger mode", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-touch", "onefinger");
  // Sticks across pages (stored on the device).
  await page.goto("/resident/marcus/speak");
  await expect(page.locator("html")).toHaveAttribute("data-touch", "onefinger");
});

test("eye typing: halving board commits a letter in 5 picks; draft follows to the letter board", async ({ page }) => {
  await page.goto("/resident/marcus/type-eyes");
  await expect(page.getByRole("heading", { name: "Pick the side with your letter" })).toBeVisible();

  // Touch fallback is always on: tapping the first half five times spells "a".
  for (let i = 0; i < 5; i += 1) {
    await page.locator(".gaze-grid .gaze-tile").first().click();
  }
  await expect(page.locator(".typed-strip .typed-text")).toHaveText("a");

  // Undo-first correction, then retype.
  await page.getByRole("button", { name: "Undo letter", exact: true }).click();
  await expect(page.locator(".typed-strip .typed-text")).toHaveText("Nothing yet.");
  for (let i = 0; i < 5; i += 1) {
    await page.locator(".gaze-grid .gaze-tile").first().click();
  }

  // Shared composer state: the same words wait on the letter board.
  await page.getByRole("link", { name: "Back to the letter board", exact: true }).click();
  await expect(page.locator(".typed-strip .typed-text")).toHaveText("a");
});

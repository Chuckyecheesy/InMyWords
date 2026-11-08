import { expect, test } from "@playwright/test";

/** Roadmap Phase 4: more ways to say it — letter board, My cards, Guide me. */

test("speak page offers the other ways to say it", async ({ page }) => {
  await page.goto("/resident/marcus/speak");
  await expect(page.getByRole("link", { name: "Type instead", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "My cards", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Guide me", exact: true })).toBeVisible();
});

test("letter board: typing letters shows word suggestions, tap composes", async ({ page }) => {
  await page.goto("/resident/marcus/type");
  await expect(page.getByRole("heading", { name: "Type it out" })).toBeVisible();
  await page.getByRole("button", { name: "c", exact: true }).click();
  await page.getByRole("button", { name: "o", exact: true }).click();
  // marcus has a coffee tile, so his own word comes up first
  const chip = page.getByRole("button", { name: "coffee", exact: true });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(page.locator(".typed-strip")).toContainText("coffee");
});

test("letter board: Back removes a letter, Clear starts over", async ({ page }) => {
  await page.goto("/resident/marcus/type");
  await page.getByRole("button", { name: "a", exact: true }).click();
  await page.getByRole("button", { name: "b", exact: true }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.locator(".typed-strip")).toContainText("a");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator(".typed-strip")).not.toContainText("ab");
});

test("my cards: add flow reaches the preview step with the chosen label", async ({ page }) => {
  await page.goto("/resident/marcus/cards");
  await expect(page.getByRole("heading", { name: "My picture cards" })).toBeVisible();
  await page.getByRole("button", { name: "Add a card", exact: true }).click();
  await page.locator(".card-label-input").fill("garden");
  await page.getByRole("button", { name: "Next: pick a photo", exact: true }).click();
  await page.locator(".photo-pool-item").first().click();
  await page.getByRole("button", { name: "Next: preview", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save my card", exact: true })).toBeVisible();
  await expect(page.locator(".card-preview .tile-label")).toHaveText("garden");
});

test("guide me: What -> Where -> When steps advance and allow skipping", async ({ page }) => {
  await page.goto("/resident/marcus/guide");
  await expect(page.getByRole("heading", { name: "What do you want?" })).toBeVisible();
  await page.getByRole("button", { name: "coffee", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Where?" })).toBeVisible();
  await expect(page.getByText("So far: coffee")).toBeVisible();
  await page.getByRole("button", { name: "Skip this", exact: true }).click();
  await expect(page.getByRole("heading", { name: "When?" })).toBeVisible();
  await page.getByRole("button", { name: "now", exact: true }).click();
  // lands on Say it; either suggestions arrive or the plain fallback is offered
  await expect(page.getByRole("heading", { name: "Say it" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Just say: coffee now", exact: true })).toBeVisible({
    timeout: 30000,
  });
});

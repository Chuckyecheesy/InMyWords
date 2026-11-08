import { expect, test } from "@playwright/test";

/** Roadmap Phase 4: more ways to say it — letter board, My cards, Guide me. */

test("speak page offers the other ways to say it", async ({ page }) => {
  await page.goto("/resident/marcus/speak");
  // The links live behind a disclosure so the picture grid stays the default.
  await page.getByText("Other ways to communicate").click();
  await expect(page.getByRole("link", { name: "My own words", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Type instead", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "My cards", exact: true })).toHaveCount(0);
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

test("say my words: create a card, then select it without speaking", async ({ page }) => {
  let saves = 0;
  let spoken = 0;
  await page.route("**/backend/tiles", async (route) => {
    saves++;
    await route.fulfill({ json: { ok: true, tile: { id: 123, label: "garden", category: "my cards", cloudinary_id: "tiles/marcus_coffee" } } });
  });
  await page.route("**/backend/residents/marcus", async (route) => {
    await route.fulfill({ json: {
      name: "Marcus",
      tiles: [{ id: 123, label: "garden", category: "my cards", cloudinary_id: "tiles/marcus_coffee" }],
    } });
  });
  await page.route("**/backend/speak", async (route) => {
    spoken++;
    await route.fulfill({ json: { audio_url: "/audio.mp3" } });
  });
  await page.goto("/resident/marcus/speak/words");
  await page.getByRole("button", { name: "Add a card", exact: true }).click();
  await page.locator(".card-label-input").fill("garden");
  await page.getByRole("button", { name: "Next: pick a photo", exact: true }).click();
  await page.locator(".photo-pool-item").first().click();
  await page.getByRole("button", { name: "Next: preview", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save my card", exact: true })).toBeVisible();
  await expect(page.locator(".card-preview .tile-label")).toHaveText("garden");
  expect(saves).toBe(0);
  await page.getByRole("button", { name: "Save my card", exact: true }).click();
  await expect(page.getByText('"garden" is on your grid now.')).toBeVisible();
  await page.getByRole("button", { name: "garden", exact: true }).click();
  await expect(page.locator(".composer-strip")).toContainText("garden");
  expect(saves).toBe(1);
  expect(spoken).toBe(0);
});

test("my picture cards keeps the hide controls but moves Add a card to Say my words", async ({ page }) => {
  await page.goto("/resident/marcus/cards");
  await expect(page.getByRole("heading", { name: "My picture cards" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add a card", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hide" }).first()).toBeVisible();
  await page.getByRole("link", { name: "Back to my tiles" }).click();
  await expect(page.getByRole("button", { name: "Add a card", exact: true })).toBeVisible();
});

test("a saved card can retry a failed refresh without saving twice", async ({ page }) => {
  let saves = 0;
  let reads = 0;
  await page.route("**/backend/tiles", async (route) => {
    saves++;
    await route.fulfill({ json: { ok: true, tile: { id: 123, label: "garden", category: "my cards", cloudinary_id: "tiles/marcus_coffee" } } });
  });
  await page.route("**/backend/residents/marcus", async (route) => {
    reads++;
    if (reads === 1) return route.fulfill({ status: 503 });
    await route.fulfill({ json: {
      name: "Marcus",
      tiles: [{ id: 123, label: "garden", category: "my cards", cloudinary_id: "tiles/marcus_coffee" }],
    } });
  });
  await page.goto("/resident/marcus/speak/words");
  await page.getByRole("button", { name: "Add a card", exact: true }).click();
  await page.getByLabel("Card label").fill("garden");
  await page.getByRole("button", { name: "Next: pick a photo" }).click();
  await page.locator(".photo-pool-item").first().click();
  await page.getByRole("button", { name: "Next: preview" }).click();
  await page.getByRole("button", { name: "Save my card" }).click();
  await expect(page.getByRole("status")).toContainText("Your card was saved, but the pictures could not refresh.");
  await page.getByRole("button", { name: "Refresh pictures" }).click();
  await expect(page.getByRole("button", { name: "garden", exact: true })).toBeVisible();
  expect(saves).toBe(1);
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

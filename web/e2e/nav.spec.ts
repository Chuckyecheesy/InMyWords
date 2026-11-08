import { expect, test } from "@playwright/test";

/** Roadmap Phase 1: navigation guards + entry cleanup + playable preview. */

test("staff Home returns to /staff from a deep page", async ({ page }) => {
  await page.goto("/staff/marcus/coach");
  await page.getByRole("link", { name: "Today", exact: true }).first().click();
  await expect(page).toHaveURL(/\/staff$/);
});

test("resident Home returns to the resident dashboard", async ({ page }) => {
  await page.goto("/resident/dana/speak");
  await page.getByRole("link", { name: "Home", exact: true }).first().click();
  await expect(page).toHaveURL(/\/resident\/dana$/);
});

test("entry page has no pitch link, stack row, or event attribution", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Built for CommuniHacks")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Pitch deck" })).toHaveCount(0);
  await expect(page.locator(".builtwith")).toHaveCount(0);
  await expect(page.getByText("Demo profile").first()).toBeVisible();
});

test("entry preview is playable: tapping a picture changes the sentence", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("double-double")).toBeVisible();
  await page.getByRole("button", { name: "bowling", exact: true }).click();
  await expect(page.getByText("Can we go bowling on Saturday?")).toBeVisible();
  await expect(page.getByText("double-double")).toHaveCount(0);
});

test("no em dashes in rendered copy on key screens", async ({ page }) => {
  for (const path of ["/", "/staff", "/resident/marcus"]) {
    await page.goto(path);
    const body = await page.locator("body").innerText();
    expect(body.includes("—"), `em dash found on ${path}`).toBe(false);
  }
});

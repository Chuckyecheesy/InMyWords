import { test, expect } from "@playwright/test";

test("categories, saved draft, confirmation and shared staff status", async ({ page, request }) => {
  await page.goto("/resident/marcus/services");
  await expect(page.getByRole("heading", { name: "What would you like help with?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review request" })).toBeDisabled();
  await page.getByRole("button", { name: "Refreshments", exact: true }).click();
  await page.getByRole("button", { name: "Family", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Family", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Refreshments", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: "test-results/services-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/services-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Review request" }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("button", { name: "Family", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Review request" }).click();
  const responsePromise = page.waitForResponse((response) => response.url().includes("/service-requests") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Confirm and call staff" }).click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const submitted = await response.json();
  expect(submitted.categories).toEqual(["refreshments", "family"]);
  await expect(page.getByRole("heading", { name: "Your request is with staff" })).toBeVisible();
  const staff = await page.context().newPage();
  await staff.goto("/staff");
  const row = staff.locator(".service-request-row").filter({ has: staff.getByRole("heading", { name: "Marcus", exact: true }) }).filter({ hasText: "Refreshments · Family" }).first();
  await row.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.locator(".service-request-row").filter({ hasText: "Refreshments · Family" }).first()).toContainText("Staff acknowledged", { timeout: 15000 });
  await row.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(page.locator(".service-request-row").filter({ hasText: "Refreshments · Family" }).first()).toContainText("Completed", { timeout: 15000 });
  await page.reload();
  await expect(page.getByRole("button", { name: "Family", exact: true })).toHaveAttribute("aria-pressed", "false");
  const stored = await (await request.get(`http://127.0.0.1:8000/service-requests?resident_id=marcus`)).json();
  expect(stored.requests.find((item: { id: string }) => item.id === submitted.id).status).toBe("completed");
});

test("failed submission keeps choices and safely reuses the submission key", async ({ page }) => {
  await page.goto("/resident/dana/services");
  await page.getByRole("button", { name: "Entertainment", exact: true }).click();
  await page.getByRole("button", { name: "Review request" }).click();
  const keys: string[] = [];
  await page.route("**/backend/service-requests", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataJSON(); keys.push(body.submission_key);
    if (keys.length === 1) return route.fulfill({ status: 503, json: { detail: "offline" } });
    return route.continue();
  });
  await page.getByRole("button", { name: "Confirm and call staff" }).click();
  await expect(page.locator(".service-error")).toContainText("Your choices are kept");
  await page.getByRole("button", { name: "Confirm and call staff" }).click();
  await expect(page.getByRole("heading", { name: "Your request is with staff" })).toBeVisible();
  expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
  const row = page.locator(".service-request-row").filter({ hasText: "Entertainment" }).first();
  await row.getByRole("button", { name: "Cancel request" }).click();
  await expect(row).toContainText("Cancelled");
});

test("input preference restores with camera off and drafts stay resident scoped", async ({ page }) => {
  const modelLoads: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/models/")) modelLoads.push(r.url()); });
  await page.goto("/resident/marcus/services");
  await page.getByRole("button", { name: "Family", exact: true }).click();
  await page.getByRole("button", { name: "Hand", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Hand", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Turn camera on" })).toBeVisible();
  expect(modelLoads).toEqual([]);
  await page.goto("/resident/dana/services");
  await expect(page.getByRole("button", { name: "Family", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Touch", exact: true })).toHaveAttribute("aria-pressed", "true");
});

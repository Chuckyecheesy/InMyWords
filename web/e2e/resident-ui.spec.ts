import { expect, test } from "@playwright/test";

test("a failed choice load can be retried without deciding for the resident", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let ready = false;
  let decisions = 0;
  await page.route("**/backend/choices**", async (route) => {
    if (route.request().url().includes("/decide")) {
      decisions++;
      return route.fulfill({ json: { ok: true } });
    }
    if (!ready) return route.fulfill({ status: 500, body: "Internal Server Error" });
    return route.fulfill({ json: {
      id: 999,
      question: "Bowling or a movie this Saturday?",
      weekly_budget: 40,
      status: "not_yet_decided",
      options: [
        { label: "Bowling", photo: null, cost: 15, money_left: 25, consequence: "Costs $15. $25 left this week." },
        { label: "Movie", photo: null, cost: 12, money_left: 28, consequence: "Costs $12. $28 left this week." },
        { label: "not decided yet", photo: null, cost: 0, consequence: "We can come back to this." },
      ],
    } });
  });
  await page.goto("/resident/marcus/choice");
  const errors = page.getByRole("main").getByRole("alert");
  await expect(errors).toContainText("Your options couldn’t load");
  ready = true;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("button", { name: "Bowling", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Movie", exact: true })).toBeVisible();
  await expect(errors).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(decisions).toBe(0);
});

test("Display remains named on mobile and Escape restores keyboard focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/resident/marcus");
  const display = page.getByRole("button", { name: "Display settings", exact: true });
  await display.click();
  await page.getByRole("button", { name: "High contrast", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "contrast");
  await page.keyboard.press("Escape");
  await expect(display).toBeFocused();
  await expect(page.getByRole("group", { name: "Display settings" })).toHaveCount(0);
});

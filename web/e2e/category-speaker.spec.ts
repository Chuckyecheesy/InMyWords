import { test, expect } from "@playwright/test";

test("only three categories, a complete sentence, and exactly that sentence spoken", async ({ page }) => {
  const spoken: string[] = [];
  const saved: string[] = [];
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = async function () {
      setTimeout(() => this.dispatchEvent(new Event("ended")), 80);
    };
  });
  await page.route("**/backend/speak", async (route) => {
    spoken.push(route.request().postDataJSON().text);
    await route.fulfill({ json: { audio_url: "/test-speech.wav" } });
  });
  await page.route("**/backend/sentences", async (route) => {
    saved.push(route.request().postDataJSON().chosen_text);
    await route.fulfill({ json: { id: "speaker-test" } });
  });
  await page.goto("/resident/marcus/speak");
  await expect(page.locator(".service-category")).toHaveCount(3);
  for (const label of ["bowling", "yes", "no", "All pictures", "Help me say it"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole("button", { name: "Say my words", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Refreshments", exact: true }).click();
  await page.getByRole("button", { name: "Family", exact: true }).click();
  const sentence = "I would like some refreshments and help contacting my family.";
  await expect(page.locator(".composer-sentence")).toHaveText(sentence);
  expect(spoken).toEqual([]);
  await page.getByRole("button", { name: "Say my words", exact: true }).click();
  await expect.poll(() => spoken).toEqual([sentence]);
  await expect.poll(() => saved).toEqual([sentence]);
  await page.getByRole("button", { name: "Start again", exact: true }).click();
  await expect(page.getByRole("button", { name: "Say my words", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".composer-sentence")).toHaveText(sentence);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const panel = page.locator(".service-settings");
  async function openPanel() {
    const body = panel.locator(".service-settings-body");
    if (!(await body.isVisible())) await panel.locator("summary").click();
    return body.boundingBox();
  }
  const eye = await openPanel();
  expect(eye!.width).toBeGreaterThan(600);
  expect(eye!.height).toBe(320);
  await page.getByRole("button", { name: "Hand", exact: true }).click();
  const hand = await openPanel();
  expect(hand!.width).toBe(eye!.width);
  expect(hand!.height).toBe(eye!.height);
  await page.getByRole("button", { name: "Touch", exact: true }).click();
  const touch = await openPanel();
  expect(touch!.width).toBe(eye!.width);
  expect(touch!.height).toBe(eye!.height);
  await page.getByRole("button", { name: "Eyes", exact: true }).click();
  for (const button of await page.locator(".service-category").all()) {
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(220);
  }
  await page.keyboard.press("Alt+S");
  await expect(page.getByRole("button", { name: "Turn camera off", exact: true })).toBeVisible();
  await page.keyboard.press("Alt+S");
  await expect(page.getByRole("button", { name: "Turn camera on", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/speaker-tablet.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/speaker-phone.png", fullPage: true });
});

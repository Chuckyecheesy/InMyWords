import { expect, test } from "@playwright/test";

/** Garden palette (warm, light-first) on the three shells, plus the two
 *  guarantees that must survive any restyle: dark mode exists, and explicit
 *  high contrast still wins. Colors come from tokens.css — update together. */

const GARDEN_INK = "rgb(58, 47, 42)"; // --ink #3a2f2a
const GARDEN_ACCENT = "#8c4b3b";

for (const width of [1280, 390]) {
  test(`garden palette on landing, resident, and staff at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, route] of [
      ["landing", "/"],
      ["resident", "/resident/marcus/speak"],
      ["staff", "/staff"],
    ]) {
      await page.goto(route);
      await expect(page.locator("body")).toHaveCSS("color", GARDEN_INK);
      const accent = await page.locator("html").evaluate((node) =>
        getComputedStyle(node).getPropertyValue("--accent").trim(),
      );
      expect(accent).toBe(GARDEN_ACCENT);
      await page.screenshot({ path: testInfo.outputPath(`${name}-${width}.png`), fullPage: true });
    }
  });
}

test("explicit high contrast still overrides the garden theme", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("imw-theme", "contrast"));
  await page.goto("/resident/marcus/speak");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "contrast");
  await expect(page.locator("body")).toHaveCSS("color", "rgb(0, 0, 0)");
  // The page colour lives on <html> since the atmosphere layer landed.
  await expect(page.locator("html")).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

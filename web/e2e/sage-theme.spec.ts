import { expect, test } from "@playwright/test";

for (const width of [1280, 390]) {
  test(`sage palette on landing, resident, and staff at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, route] of [
      ["landing", "/"],
      ["resident", "/resident/marcus/speak"],
      ["staff", "/staff"],
    ]) {
      await page.goto(route);
      await expect(page.locator("body")).toHaveCSS("color", "rgb(26, 31, 46)");
      const accent = await page.locator("html").evaluate((node) =>
        getComputedStyle(node).getPropertyValue("--accent").trim(),
      );
      expect(accent).toBe("#4b6653");
      await page.screenshot({ path: testInfo.outputPath(`${name}-${width}.png`), fullPage: true });
    }
  });
}

test("explicit high contrast still overrides sage", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("imw-theme", "contrast"));
  await page.goto("/resident/marcus/speak");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "contrast");
  await expect(page.locator("body")).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

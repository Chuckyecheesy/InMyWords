import { expect, test } from "@playwright/test";

test("landing preview highlights only the selected picture", async ({ page }) => {
  await page.goto("/");
  const tiles = page.locator("button.entry-preview-tile");
  await expect(tiles).toHaveCount(3);

  for (const index of [0, 1, 2, 0]) {
    await tiles.nth(index).click();
    await expect(page.locator('button.entry-preview-tile[aria-pressed="true"]')).toHaveCount(1);
    await expect(tiles.nth(index)).toHaveAttribute("aria-pressed", "true");

    const colors = await tiles.evaluateAll((buttons) => buttons.map((button) => ({
      actual: getComputedStyle(button).borderTopColor,
      expected: getComputedStyle(button).getPropertyValue(
        button.getAttribute("aria-pressed") === "true" ? "--accent" : "--line",
      ).trim(),
    })));
    for (const { actual, expected } of colors) {
      // Normalize CSS variables to computed browser colors before comparing.
      const normalized = await page.evaluate((color) => {
        const element = document.createElement("span");
        element.style.color = color;
        document.body.append(element);
        const result = getComputedStyle(element).color;
        element.remove();
        return result;
      }, expected);
      expect(actual).toBe(normalized);
    }
  }
});

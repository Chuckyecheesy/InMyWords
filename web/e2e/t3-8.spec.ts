import { expect, test } from "@playwright/test";

/**
 * T3.8: a long press speaks a button and does not run it, an answer can be
 * undone, and the pitch deck waits for a tap.
 */

test.describe("T3.8 accessibility and pitch", () => {
  test("a long press speaks Help me say it and does not ask for suggestions", async ({ page }) => {
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") posts.push(request.url());
    });
    await page.goto("/resident/marcus/speak");
    await page.getByRole("button", { name: "coffee" }).click();
    const spoken = page.waitForResponse(
      (response) => response.url().includes("/speak") && response.request().method() === "POST",
    );
    const button = page.getByRole("button", { name: "Help me say it" });
    await button.dispatchEvent("pointerdown", { button: 0, pointerType: "mouse" });
    await page.waitForTimeout(700);
    await button.dispatchEvent("pointerup", { button: 0, pointerType: "mouse" });
    expect((await spoken).request().postDataJSON()).toMatchObject({
      resident_id: "marcus",
      text: "Help me say it",
    });
    expect(posts.some((url) => url.includes("/suggest"))).toBe(false);
  });

  test("Undo puts the yes and no tiles back", async ({ page }) => {
    // The answer is HELD (client-side) until Next — Undo drops it. This is
    // also idempotent against a live database: nothing saves until Next.
    await page.goto("/resident/marcus/confirm");
    await page.getByRole("button", { name: "Yes" }).click();
    await expect(page.getByText("You said Yes.")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("button", { name: "Yes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "No" })).toBeVisible();
  });

  test("the pitch deck has six slides and does not advance on its own", async ({ page }) => {
    await page.goto("/pitch");
    await expect(page.getByText("Slide 1 of 6")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your story, told once, in your own voice." })).toBeVisible();
    await page.waitForTimeout(1200);
    await expect(page.getByText("Slide 1 of 6")).toBeVisible();
    for (const slide of [2, 3, 4, 5, 6]) {
      await page.getByRole("button", { name: "Next" }).click();
      await expect(page.getByText(`Slide ${slide} of 6`)).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
    await expect(page.getByRole("heading", { name: "The demo uses fiction. The shape is ready." })).toBeVisible();
  });
});

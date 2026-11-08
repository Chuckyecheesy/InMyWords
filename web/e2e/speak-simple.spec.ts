import { expect, test } from "@playwright/test";

test("simple speaking path keeps optional tools out of the way and asks before speaking", async ({ page }) => {
  const speech: string[] = [];
  await page.route("**/suggest", (route) => route.fulfill({
    json: { options: ["I would like coffee.", "Coffee, please."] },
  }));
  await page.route("**/speak", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    speech.push(route.request().postDataJSON().text);
    await route.fulfill({ json: { audio_url: "/test-audio.mp3" } });
  });
  await page.goto("/resident/marcus/speak");
  await expect(page.getByRole("heading", { name: "What do you want to say?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Help me say it", exact: true })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Type instead" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Now", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Say my words", exact: true })).toBeHidden();

  await page.getByRole("button", { name: "coffee", exact: true }).click();
  await page.getByRole("button", { name: "Help me say it", exact: true }).click();
  await expect(page.getByRole("button", { name: "I would like coffee.", exact: true })).toBeVisible();
  expect(speech).toEqual([]);
  await page.getByRole("button", { name: "I would like coffee.", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(speech).toEqual([]);

  // Optional methods remain available without losing the selected pictures.
  await page.getByRole("dialog").getByRole("button", { name: "Cancel, choose another" }).click();
  await page.getByText("More options", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Say my words", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "coffee", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByText("Other ways to communicate", { exact: true }).click();
  await expect(page.getByRole("link", { name: "Type instead" })).toBeVisible();
});

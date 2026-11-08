import { expect, test } from "@playwright/test";

/**
 * Gaze/gesture e2e — what a headless browser CAN verify (a fake webcam
 * stands in for the real one): consent gating, the camera-off guarantees
 * (TC1), screen wiring, and that the camera path degrades without
 * crashing. Real-face accuracy (TC2-TC10) stays a human job.
 */

test.use({
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});

test("TC1: camera off — everything works by touch, no indicator, no eye grid", async ({
  page,
}) => {
  await page.goto("/resident/marcus/speak");
  await expect(page.getByRole("button", { name: "Use my eyes and hands" })).toBeVisible();
  await expect(page.getByText("Camera on")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Eye grid" })).toHaveCount(0);

  // Touch flow untouched: tap a tile, it lands in the composer sentence.
  await page.getByRole("button", { name: "coffee", exact: true }).click();
  await expect(page.locator(".composer-sentence")).toContainText("coffee");
});

test("calibration screen is gated on consent", async ({ page }) => {
  await page.goto("/resident/marcus/calibrate");
  await expect(page.getByText("Turn on “Use my eyes and hands”")).toBeVisible();
  await expect(page.getByText("Back to my tiles")).toBeVisible();
});

test("teach-a-gesture screen is gated on consent", async ({ page }) => {
  await page.goto("/resident/marcus/teach");
  await expect(page.getByText("Turn on “Use my eyes and hands”")).toBeVisible();
});

test("G7: How I Communicate card sits in the onboarding communication step", async ({
  page,
}) => {
  await page.goto("/staff/marcus/onboarding");
  // The card lives on the "How they communicate" step after the redesign.
  await page.getByRole("button", { name: /how they communicate/i }).click();
  await expect(page.getByText("From Marcus's input history")).toBeVisible({ timeout: 20_000 });
});

test("consent on: eye grid opens and the camera indicator comes on", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  const warnings: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  page.on("console", (msg) => {
    if (msg.type() === "warning" || msg.type() === "error") warnings.push(msg.text());
  });

  await page.addInitScript(() => {
    window.localStorage.setItem("imw-camera-consent-marcus", "yes");
  });
  await page.goto("/resident/marcus/speak");

  await expect(page.getByRole("button", { name: "Eye grid" })).toBeVisible();
  await page.getByRole("button", { name: "Eye grid" }).click();

  // The 2×3 grid with the Pause tile replaces the touch grid.
  await expect(page.getByRole("region", { name: "Eye grid" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

  // Touch still works ON the gaze grid (every tile stays tappable).
  await page.getByRole("button", { name: "coffee", exact: true }).click();
  await expect(page.locator(".composer-sentence")).toContainText("coffee");

  // Fake webcam is enough for WebGazer to open the camera. The indicator
  // is the proof the face-mesh files resolved and begin() finished.
  await expect(page.getByText("Camera on")).toBeVisible({ timeout: 45_000 });

  expect(pageErrors, pageErrors.map((e) => e.message).join("\n")).toHaveLength(0);
  const startupWarnings = warnings.filter((line) => /camera start failed|gesture start failed/i.test(line));
  expect(startupWarnings, startupWarnings.join("\n")).toHaveLength(0);
});

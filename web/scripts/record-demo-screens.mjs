/** Records the demo screen captures for the product video (video/public/screens).
 *  Runs against the local prod stack on :3999 — same build as the live site.
 *  Each flow records its own 1920x1080 clip with slow, watchable pacing.
 *  Failures skip the clip and keep going; a summary prints at the end. */

import { chromium } from "@playwright/test";
import { mkdirSync, renameSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:3999";
const OUT = path.resolve("../video/public/screens");
mkdirSync(OUT, { recursive: true });

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function record(browser, name, flow, options = {}) {
  const dir = path.join(OUT, `.tmp-${name}`);
  rmSync(dir, { recursive: true, force: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir, size: { width: 1920, height: 1080 } },
    colorScheme: "light",
    ...options.context,
  });
  const page = await context.newPage();
  try {
    if (options.init) await options.init(page);
    await flow(page);
    await pause(1500);
    const video = page.video();
    await context.close();
    await video.saveAs(path.join(OUT, `${name}.webm`));
    rmSync(dir, { recursive: true, force: true });
    console.log(`ok   ${name}`);
    return true;
  } catch (error) {
    await context.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
    console.log(`FAIL ${name}: ${String(error).split("\n")[0]}`);
    return false;
  }
}

const results = {};
const browser = await chromium.launch({
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});

// 1. Login: tap Marcus, large-key PIN, land on his dashboard.
results.login = await record(browser, "login", async (page) => {
  await page.goto(`${BASE}/login`);
  await pause(2000);
  await page.getByRole("button", { name: "Marcus", exact: true }).click();
  await pause(1200);
  for (const digit of "1234") {
    await page.getByRole("button", { name: digit, exact: true }).click();
    await pause(600);
  }
  await page.getByRole("button", { name: "Go", exact: true }).click();
  await page.waitForURL(/resident\/marcus$/);
  await pause(2500);
});

// 2. Category speaker: three big choices -> sentence appears.
results.categories = await record(browser, "categories", async (page) => {
  await page.goto(`${BASE}/resident/marcus/speak`);
  await pause(2500);
  await page.getByRole("button", { name: "Refreshments", exact: true }).click();
  await pause(2000);
  await page.getByRole("button", { name: "Entertainment", exact: true }).click();
  await pause(2500);
});

// 3. Full composer: tiles -> suggestions -> approve.
results["speak-for-me"] = await record(browser, "speak-for-me", async (page) => {
  await page.goto(`${BASE}/resident/marcus/speak/words`);
  await pause(2500);
  await page.getByRole("button", { name: "coffee", exact: true }).click();
  await pause(1200);
  await page.getByRole("button", { name: "now", exact: true }).click().catch(() => {});
  await pause(1200);
  await page.getByRole("button", { name: "Help me say it", exact: true }).click();
  await page.locator("button.suggestion-line").first().waitFor({ timeout: 60000 });
  await pause(2200);
  await page.locator("button.suggestion-line").first().click();
  await page.getByRole("button", { name: /Approve/ }).waitFor({ timeout: 15000 });
  await pause(1800);
  await page.getByRole("button", { name: /Approve/ }).click();
  await pause(4000);
});

// 4. Picture card: Add a card inside Say my words.
results["picture-card"] = await record(browser, "picture-card", async (page) => {
  await page.goto(`${BASE}/resident/marcus/speak/words`);
  await pause(2000);
  await page.getByRole("button", { name: "Add a card", exact: true }).click();
  await pause(1200);
  await page.getByLabel("Card label").fill("");
  await page.getByLabel("Card label").pressSequentially("garden", { delay: 220 });
  await pause(800);
  await page.getByRole("button", { name: "Next: pick a photo", exact: true }).click();
  await pause(1500);
  await page.locator(".photo-pool-item").nth(10).click();
  await pause(1200);
  await page.getByRole("button", { name: "Next: preview", exact: true }).click();
  await pause(1800);
  await page.getByRole("button", { name: "Save my card", exact: true }).click();
  await pause(3000);
});

// 5. Letter board with word suggestions.
results["letter-board"] = await record(browser, "letter-board", async (page) => {
  await page.goto(`${BASE}/resident/marcus/type`);
  await pause(2000);
  for (const letter of "co") {
    await page.getByRole("button", { name: letter, exact: true }).click();
    await pause(900);
  }
  await page.getByRole("button", { name: "coffee", exact: true }).click();
  await pause(1500);
  await page.getByRole("button", { name: "Help me say it", exact: true }).click();
  await page.getByRole("button", { name: "Say this" }).first().waitFor({ timeout: 45000 });
  await pause(2500);
});

// 6. Guided builder: What -> Where -> When.
results.builder = await record(browser, "builder", async (page) => {
  await page.goto(`${BASE}/resident/marcus/guide`);
  await pause(2000);
  await page.getByRole("button", { name: "coffee", exact: true }).click();
  await pause(1500);
  await page.getByRole("button", { name: "Skip this", exact: true }).click();
  await pause(1500);
  await page.getByRole("button", { name: "now", exact: true }).click();
  await page.getByRole("button", { name: /Just say: coffee now/ }).waitFor({ timeout: 45000 });
  await pause(2500);
});

// 7. Eye typing: halving board (touch path shows the narrowing halves).
results["eye-typing"] = await record(
  browser,
  "eye-typing",
  async (page) => {
    await page.goto(`${BASE}/resident/marcus/type-eyes`);
    await pause(2500);
    for (let i = 0; i < 5; i++) {
      await page.locator(".gaze-grid .gaze-tile").first().click();
      await pause(1100);
    }
    await pause(2000);
  },
);

// 8. One-finger mode: toggle, board grows.
results["one-finger"] = await record(browser, "one-finger", async (page) => {
  await page.goto(`${BASE}/resident/marcus/type`);
  await pause(2000);
  await page.getByRole("button", { name: "Display settings", exact: true }).click();
  await pause(1200);
  await page.getByRole("button", { name: "One finger mode", exact: true }).click();
  await pause(2000);
  await page.keyboard.press("Escape");
  await pause(800);
  await page.getByRole("button", { name: "t", exact: true }).click();
  await pause(2000);
});

// 9. Supported choice with budget math.
results.choice = await record(browser, "choice", async (page) => {
  await page.goto(`${BASE}/resident/marcus/choice`);
  await page.getByRole("button", { name: /Bowling/ }).first().waitFor({ timeout: 45000 });
  await pause(2500);
  await page.getByRole("button", { name: "Bowling", exact: true }).click();
  await pause(3000);
});

// 10. Planner: add a routine -> visits on the week.
results.planner = await record(browser, "planner", async (page) => {
  await page.goto(`${BASE}/resident/marcus/planner`);
  await pause(3000);
  await page.mouse.wheel(0, 400);
  await pause(2000);
  await page.mouse.wheel(0, 400);
  await pause(2500);
});

// 11. Staff planner: same week, accept controls.
results["staff-planner"] = await record(browser, "staff-planner", async (page) => {
  await page.goto(`${BASE}/staff/marcus/planner`);
  await pause(3000);
  await page.mouse.wheel(0, 400);
  await pause(2500);
});

// 12. Get staff help, resident side.
results["staff-help-resident"] = await record(browser, "staff-help-resident", async (page) => {
  await page.goto(`${BASE}/resident/marcus`);
  await pause(2000);
  await page.getByRole("button", { name: "Get staff help", exact: true }).click();
  await pause(2000);
  await page.getByRole("button", { name: "Yes, please come", exact: true }).click();
  await pause(3000);
});

// 13. Get staff help, staff side: banner -> I'm coming.
results["staff-help-staff"] = await record(browser, "staff-help-staff", async (page) => {
  await page.goto(`${BASE}/staff`);
  await page.locator(".urgent-banner").waitFor({ timeout: 20000 });
  await pause(2500);
  await page.getByRole("button", { name: "I'm coming" }).first().click();
  await pause(2500);
});

// 14. My Story.
results.story = await record(browser, "story", async (page) => {
  await page.goto(`${BASE}/resident/marcus/story`);
  await pause(3000);
  await page.mouse.wheel(0, 500);
  await pause(2500);
});

// 15. Staff updates feed.
results.updates = await record(browser, "updates", async (page) => {
  await page.goto(`${BASE}/staff/updates?resident=marcus`);
  await pause(3000);
  await page.mouse.wheel(0, 450);
  await pause(2500);
});

// 16. Coach with View sources.
results.coach = await record(browser, "coach", async (page) => {
  await page.goto(`${BASE}/staff/marcus/coach`);
  await pause(2000);
  await page.getByRole("textbox").first().pressSequentially("What upsets Marcus?", { delay: 90 });
  await pause(600);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page.locator(".msg-a").first().waitFor({ timeout: 60000 });
  await pause(2000);
  await page.getByText(/View sources/).first().click();
  await pause(3000);
});

// 17. Records library.
results.records = await record(browser, "records", async (page) => {
  await page.goto(`${BASE}/staff/marcus/records`);
  await pause(2500);
  await page.getByText("Resident Information Binder").first().click();
  await pause(3000);
});

// 18. Memory confirm: pattern noticed -> Marcus decides.
results.memory = await record(browser, "memory", async (page) => {
  await page.goto(`${BASE}/resident/marcus/confirm`);
  await pause(3000);
  await page.getByRole("button", { name: "Yes", exact: true }).click();
  await pause(2000);
});

await browser.close();
const failed = Object.entries(results).filter(([, ok]) => !ok).map(([k]) => k);
console.log(`\n${Object.keys(results).length - failed.length}/${Object.keys(results).length} recorded`);
if (failed.length) console.log("failed:", failed.join(", "));

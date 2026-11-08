// Screenshot every screen for the visual pass. Usage: node scripts/shots.mjs [outdir] [suffix]
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "shots";
const suffix = process.argv[3] ?? "";
const BASE = "http://127.0.0.1:3000";

const PAGES = [
  ["entry", "/"],
  ["resident-home", "/resident/marcus"],
  ["story", "/resident/marcus/story"],
  ["choice", "/resident/marcus/choice"],
  ["confirm", "/resident/marcus/confirm"],
  ["voice", "/resident/marcus/voice"],
  ["calibrate", "/resident/marcus/calibrate"],
  ["teach", "/resident/marcus/teach"],
  ["staff-pick", "/staff"],
  ["onboarding", "/staff/marcus/onboarding"],
  ["coach", "/staff/marcus/coach"],
  ["handoff", "/staff/handoff"],
  ["activity", "/staff/activity"],
  ["photos", "/staff/marcus/photos"],
  ["pitch", "/pitch"],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
for (const [name, path] of PAGES) {
  try {
    await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${name}${suffix}.png`, fullPage: true });
    console.log(`ok ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}: ${String(error).slice(0, 120)}`);
  }
}
await browser.close();

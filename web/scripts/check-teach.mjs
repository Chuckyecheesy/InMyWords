import { chromium } from "@playwright/test";

const shots =
  "C:/Users/tiffm/AppData/Local/Temp/claude/C--Users-tiffm-Desktop-InMyWords/a7df4def-9bb3-4f84-a1e2-5156f4eac92b/scratchpad/shots";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1380, height: 900 } });
await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.screenshot({ path: `${shots}/brand-entry.png` });
await page.goto("http://127.0.0.1:3000/pitch", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/brand-pitch.png` });
await page.goto("http://127.0.0.1:3000/staff", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/brand-staff.png` });
console.log("brand shots done");
await browser.close();

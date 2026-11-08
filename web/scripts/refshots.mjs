import { chromium } from "@playwright/test";

const out =
  "C:/Users/tiffm/AppData/Local/Temp/claude/C--Users-tiffm-Desktop-InMyWords/a7df4def-9bb3-4f84-a1e2-5156f4eac92b/scratchpad/refs";

const SITES = [
  ["inngest", "https://www.inngest.com/"],
  ["recompile", "https://recompile-web.vercel.app/"],
  ["cadenza", "https://cadenza.tiffmares.workers.dev/"],
];

const browser = await chromium.launch();
for (const [name, url] of SITES) {
  const page = await browser.newPage({ viewport: { width: 1380, height: 900 } });
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/${name}-top.png` });
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/${name}-mid.png` });
    console.log(`ok ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}: ${String(error).slice(0, 100)}`);
  }
  await page.close();
}
await browser.close();

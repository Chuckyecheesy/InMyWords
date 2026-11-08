import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// Staff: from a deep page, does a Home control return to /staff?
await page.goto("http://127.0.0.1:3000/staff/marcus/coach", { waitUntil: "networkidle" });
const staffHome = page.getByRole("link", { name: /home|in my words|today/i }).first();
console.log("staff header links:",
  await page.locator("header a, nav a").evaluateAll((els) =>
    els.slice(0, 8).map((e) => `${e.textContent?.trim().slice(0, 20)}→${e.getAttribute("href")}`)));

// Resident: from speak, does Home go to the resident dashboard?
await page.goto("http://127.0.0.1:3000/resident/dana/speak", { waitUntil: "networkidle" });
console.log("resident header links:",
  await page.locator("header a").evaluateAll((els) =>
    els.map((e) => `${e.textContent?.trim().slice(0, 20)}→${e.getAttribute("href")}`)));
await page.getByRole("link", { name: "Home", exact: true }).first().click();
await page.waitForTimeout(800);
console.log("after resident Home click:", page.url());

await browser.close();

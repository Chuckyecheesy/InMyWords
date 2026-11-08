import { expect, test, type Page } from "@playwright/test";

/** Roadmap Phase 2: accounts & privacy. The gate: cross-resident access
 *  must be blocked at BOTH the API (403) and the UI (blocker screen). */

async function residentLogin(page: Page, name: string, pin: string) {
  await page.goto("/login");
  await page.getByRole("button", { name, exact: true }).click();
  for (const digit of pin) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
  await page.getByRole("button", { name: "Go", exact: true }).click();
}

test("login page offers resident tiles and a staff form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Marcus", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dana", exact: true })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});

test("resident signs in with their PIN and lands on their own page", async ({ page }) => {
  await residentLogin(page, "Marcus", "1234");
  await expect(page).toHaveURL(/\/resident\/marcus$/);
});

test("a wrong PIN shows a friendly error and stays put", async ({ page }) => {
  await residentLogin(page, "Marcus", "9999");
  await expect(page.getByText("That didn't match. Try again.")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("signed in as Dana, Marcus's page is blocked at UI and API", async ({ page }) => {
  await residentLogin(page, "Dana", "2468");
  await expect(page).toHaveURL(/\/resident\/dana$/);

  // API level: the session cookie rides along and gets a 403.
  const response = await page.request.get("/backend/residents/marcus");
  expect(response.status()).toBe(403);

  // UI level: the page shell is covered by the privacy screen.
  await page.goto("/resident/marcus");
  await expect(page.getByText("This page belongs to someone else.")).toBeVisible();
  await page.getByRole("link", { name: "Go to my page", exact: true }).click();
  await expect(page).toHaveURL(/\/resident\/dana$/);
});

test("staff sign-in scopes to assigned residents and can sign out", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("jordan@inmywords.demo");
  await page.getByLabel("Password").fill("bluejay-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/staff$/);
  await expect(page.getByText("Jordan").first()).toBeVisible();

  // Jordan supports Marcus but not Dana.
  expect((await page.request.get("/backend/residents/marcus")).status()).toBe(200);
  expect((await page.request.get("/backend/residents/dana")).status()).toBe(403);

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("staff can create a resident with starter cards and a PIN login", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("sam@inmywords.demo");
  await page.getByLabel("Password").fill("sunflower-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/staff$/);

  await page.goto("/staff/new");
  const name = `Pat${Date.now().toString().slice(-5)}`;
  await page.getByLabel("First name").fill(name);
  await page.getByLabel(/Sign-in PIN/).fill("4321");
  await page.getByRole("button", { name: "Create their page", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/staff/${name.toLowerCase()}$`), { timeout: 15000 });
});

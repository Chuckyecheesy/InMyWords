import { expect, test, type Page, type Request } from "@playwright/test";

/**
 * T3.6 in the browser: the choice screen posts the demo options, shows the
 * money code calculated, and records the tap. A long press speaks the label
 * and does not decide.
 */

function posts(requests: Request[], fragment: string) {
  return requests.filter((request) => request.url().includes(fragment) && request.method() === "POST");
}

async function openChoice(page: Page, resident: "marcus" | "dana") {
  const created = page.waitForResponse(
    (response) => response.url().includes("/choices") && response.request().method() === "POST" && !response.url().includes("/decide"),
  );
  await page.goto(`/resident/${resident}/choice`);
  const response = await created;
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test.describe("T3.6 supported choice", () => {
  test("Marcus sees the money left and his tap is saved", async ({ page }) => {
    const sent: Request[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") sent.push(request);
    });

    const body = await openChoice(page, "marcus");
    expect(body.weekly_budget).toBe(40);
    expect(body.options.map((option: { label: string }) => option.label)).toEqual([
      "Bowling",
      "Movie",
      "not decided yet",
    ]);
    const bowling = body.options.find((option: { label: string }) => option.label === "Bowling");
    const movie = body.options.find((option: { label: string }) => option.label === "Movie");
    expect(bowling.money_left).toBe(25);
    expect(movie.money_left).toBe(28);

    await expect(page.getByRole("heading", { name: "Bowling or a movie this Saturday?" })).toBeVisible();
    await expect(page.getByText("Weekly budget $40.")).toBeVisible();
    await expect(page.getByText("$25 left this week.")).toBeVisible();
    await expect(page.getByText("$28 left this week.")).toBeVisible();

    const bowlingButton = page.getByRole("button", { name: "Bowling", exact: true });
    const box = await bowlingButton.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(64);
    expect(box?.height).toBeGreaterThanOrEqual(64);

    const decided = page.waitForResponse((response) => response.url().includes("/decide"));
    await bowlingButton.click();
    const decision = await decided;
    expect(decision.ok()).toBeTruthy();
    expect(decision.request().postDataJSON()).toEqual({ chosen: "Bowling" });
    await expect(page.getByTestId("choice-standing")).toHaveText("Marcus chose Bowling.");

    const create = posts(sent, "/choices").find((request) => !request.url().includes("/decide"));
    expect(create?.postDataJSON()).toMatchObject({
      resident_id: "marcus",
      question: "Bowling or a movie this Saturday?",
    });
  });

  test("Dana's costs leave the right amount, and waiting is a choice", async ({ page }) => {
    const body = await openChoice(page, "dana");
    expect(body.weekly_budget).toBe(60);
    const herbs = body.options.find((option: { label: string }) => option.label === "Herb garden");
    const groceries = body.options.find((option: { label: string }) => option.label === "Groceries");
    const waiting = body.options.find((option: { label: string }) => option.label === "not decided yet");
    expect(herbs.money_left).toBe(38);
    expect(groceries.money_left).toBe(20);
    expect(waiting.cost).toBe(0);
    expect(waiting.money_left).toBe(60);
    await expect(page.getByText("$38 left this week.")).toBeVisible();
    await expect(page.getByText("$20 left this week.")).toBeVisible();

    const decided = page.waitForResponse((response) => response.url().includes("/decide"));
    await page.getByRole("button", { name: "not decided yet" }).click();
    const decision = await decided;
    expect(decision.request().postDataJSON()).toEqual({ chosen: "not_yet_decided" });
    await expect(page.getByTestId("choice-standing")).toHaveText("Not decided yet.");
  });

  test("a long press speaks the label and does not decide", async ({ page }) => {
    await openChoice(page, "marcus");
    const speakResponse = page.waitForResponse(
      (response) => response.url().includes("/speak") && response.request().method() === "POST",
    );
    const movie = page.getByRole("button", { name: "Movie", exact: true });
    await movie.dispatchEvent("pointerdown", { button: 0, pointerType: "mouse" });
    await page.waitForTimeout(700);
    await movie.dispatchEvent("pointerup", { button: 0, pointerType: "mouse" });
    const spoken = await speakResponse;
    expect(spoken.request().postDataJSON()).toMatchObject({ resident_id: "marcus", text: "Movie" });
    await expect(page.getByTestId("choice-standing")).toHaveCount(0);
  });
});

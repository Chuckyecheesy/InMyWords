import { expect, test, type Page } from "@playwright/test";

test.use({
  reducedMotion: "reduce",
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
});

// Model output is deterministic here; real webcam accuracy requires a human.
async function installTracker(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("imw-camera-consent-marcus", "yes");
    const state = { aim: "", missing: false, stopped: 0, records: 0, begins: 0, frames: 0 };
    Object.assign(window, { gazeTest: state });
    let listener: (point: { x: number; y: number } | null, ts: number) => void = () => {};
    let positions: number[][] | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tracker = {
      params: { faceMeshSolutionPath: "" },
      setRegression() { return this; },
      setGazeListener(cb: typeof listener) { listener = cb; return this; },
      saveDataAcrossSessions() { return this; },
      showVideoPreview() { return this; }, showPredictionPoints() { return this; },
      showFaceOverlay() { return this; }, showFaceFeedbackBox() { return this; },
      removeMouseEventListeners() {},
      getTracker() { return { getPositions: () => positions }; },
      async clearData() { state.records = 0; },
      recordScreenPosition() { state.records++; },
      pause() { if (timer) clearInterval(timer); },
      async resume() {},
      async begin() {
        state.begins++;
        const video = document.createElement("video");
        video.id = "webgazerVideoFeed";
        Object.defineProperty(video, "srcObject", {
          value: null,
        });
        document.body.appendChild(video);
        timer = setInterval(() => {
          state.frames++;
          positions = state.missing ? null : [[state.frames, 2]];
          const target = document.querySelector(".calibrate-target") ??
            (state.aim ? Array.from(document.querySelectorAll("[data-service-target]")).find((tile) => {
              const text = (tile.textContent || "").replace(/\s+/g, " ").trim();
              return text === state.aim || tile.getAttribute("aria-label") === state.aim;
            }) : undefined);
          const rect = target?.getBoundingClientRect();
          listener(!state.missing && rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null, performance.now());
        }, 33);
      },
      end() { state.stopped++; if (timer) clearInterval(timer); document.getElementById("webgazerVideoFeed")?.remove(); },
    };
    Object.assign(window, { webgazer: tracker });
  });
  await page.route("**/models/gesture_recognizer.task", (route) => route.abort());
}
async function state(page: Page, change: { aim?: string; missing?: boolean }) {
  await page.evaluate((change) => Object.assign((window as unknown as { gazeTest: object }).gazeTest, change), change);
}
async function train(page: Page) {
  await page.getByRole("button", { name: "Start", exact: true }).click();
  for (let star = 1; star <= 9; star++) {
    const target = page.getByRole("button", { name: `Calibration star ${star}, look at it and tap`, exact: true });
    await expect(target).toBeVisible();
    await page.waitForTimeout(80); // allow a fresh face frame at each target
    for (let attempt = 0; attempt < 20 && await target.count(); attempt++) {
      await page.waitForTimeout(80);
      await target.click();
    }
    await expect(target).toHaveCount(0);
  }
}
async function check(page: Page) {
  for (let point = 1; point <= 5; point++) {
    await expect(page.getByText(`Check ${point} of 5`, { exact: true })).toBeVisible();
    await page.waitForTimeout(100); // no prediction from the previous target
    await page.getByRole("button", { name: "Accuracy check point", exact: true }).click();
  }
}

test("camera off: touch works and tracking is not loaded", async ({ page }) => {
  const models: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/models/")) models.push(request.url()); });
  await page.goto("/resident/marcus/speak");
  await expect(page.getByRole("button", { name: "Turn camera on" })).toBeVisible();
  await expect(page.locator(".service-category")).toHaveCount(3);
  await page.getByRole("button", { name: "Refreshments", exact: true }).click();
  await expect(page.locator(".composer-sentence")).toHaveText("I would like some refreshments.");
  expect(models).toEqual([]);
});

test("calibration and gesture teaching require consent", async ({ page }) => {
  for (const route of ["calibrate", "teach"]) {
    await page.goto(`/resident/marcus/${route}`);
    await expect(page.getByText(/Turn on.*Use my eyes and hands/)).toBeVisible();
  }
});

test("calibration, three-category gaze selection, storage, loss and camera off", async ({ page, request }) => {
  await installTracker(page);
  const spoken: string[] = [];
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = async function () {
      setTimeout(() => this.dispatchEvent(new Event("ended")), 100);
    };
  });
  await page.route("**/backend/speak", async (route) => {
    spoken.push(route.request().postDataJSON().text);
    await route.fulfill({ json: { audio_url: "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=" } });
  });
  await page.route("**/backend/sentences", (route) => route.fulfill({ json: { id: "gaze-speech" } }));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const events: { input_type: string; target: string; hold_ms: number }[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/input-events") && request.method() === "POST") {
      events.push(...request.postDataJSON().events);
    }
  });
  const before = await (await request.get("http://127.0.0.1:8000/input-profile/marcus")).json();
  await page.goto("/resident/marcus/speak");
  await page.getByRole("button", { name: "Turn camera on" }).click();
  await page.getByRole("link", { name: "Set up my eyes", exact: true }).click();
  await train(page);

  await state(page, { missing: true });
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Accuracy check point" }).click();
  await expect(page.getByText("Check 1 of 5", { exact: true })).toBeVisible();
  await expect(page.getByText(/Look at the circle while facing/)).toBeVisible();
  await state(page, { missing: false });
  await check(page);
  await expect(page.getByRole("heading", { name: "Lovely!" })).toBeVisible();
  await page.getByRole("link", { name: "Back to my tiles" }).click();
  await page.getByRole("button", { name: "Turn camera on" }).click();
  await expect(page.getByText("Camera on. Looking for your eyes…", { exact: true })).toBeVisible();

  await state(page, { aim: "Refreshments" });
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible({ timeout: 8000 });
  await expect(page.locator(".composer-sentence")).toHaveText("Your sentence will appear here.");
  await state(page, { aim: "Confirm" });
  await expect(page.locator(".composer-sentence")).toHaveText("I would like some refreshments.", { timeout: 12000 });
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refreshments", exact: true })).toHaveAttribute("aria-pressed", "true");
  await state(page, { aim: "" });
  await expect.poll(() => events.filter((event) => event.input_type === "gaze" && event.target === "refreshments").length).toBe(1);
  expect(events.find((event) => event.input_type === "gaze")!.hold_ms).toBeGreaterThan(600);
  await expect.poll(async () => (await (await request.get("http://127.0.0.1:8000/input-profile/marcus")).json()).events_counted).toBeGreaterThan(before.events_counted);

  await page.getByRole("button", { name: "Say my words", exact: true }).scrollIntoViewIfNeeded();
  await state(page, { aim: "Say my words" });
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible({ timeout: 8000 });
  expect(spoken).toEqual([]);
  await state(page, { aim: "Confirm" });
  await expect.poll(() => spoken, { timeout: 12000 }).toEqual(["I would like some refreshments."]);
  await page.waitForTimeout(800);
  expect(spoken).toHaveLength(1);

  await state(page, { missing: true });
  await expect(page.getByText("Camera on. Looking for your eyes…", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Turn camera off", exact: true }).click();
  await expect(page.getByRole("button", { name: "Turn camera on" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { gazeTest: { stopped: number } }).gazeTest.stopped)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("permission failure shows retry and preserves touch", async ({ page }) => {
  await installTracker(page);
  await page.addInitScript(() => {
    const tracker = (window as unknown as { webgazer: { begin(): Promise<void> } }).webgazer;
    const begin = tracker.begin.bind(tracker);
    let first = true;
    tracker.begin = async () => {
      if (first) { first = false; throw new Error("Camera permission denied"); }
      return begin();
    };
  });
  await page.goto("/resident/marcus/speak");
  await page.getByRole("button", { name: "Turn camera on" }).click();
  await expect(page.getByText(/Camera permission denied/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn camera on" })).toBeVisible();
  await page.getByRole("button", { name: "Refreshments", exact: true }).click();
  await expect(page.locator(".composer-sentence")).toContainText("refreshments");
  await page.getByRole("button", { name: "Turn camera on" }).click();
  await expect(page.locator(".service-camera")).toBeVisible();
});

test("actual WebGazer assets initialize with a simulated webcam and release its tracks", async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      Object.assign(window, { gazeStream: stream });
      return stream;
    };
  });
  const failures: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/models/") && !response.ok()) failures.push(response.url());
  });
  await page.goto("/resident/marcus/speak");
  await page.getByRole("button", { name: "Turn camera on" }).click();
  await expect(page.locator(".service-camera")).toBeVisible({ timeout: 60000 });
  expect(failures).toEqual([]);
  await page.getByRole("button", { name: "Turn camera off", exact: true }).click();
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { gazeStream: MediaStream }).gazeStream.getTracks().every((track) => track.readyState === "ended"),
  )).toBe(true);
});

test("How I Communicate remains available in staff onboarding", async ({ page }) => {
  await page.goto("/staff/marcus/onboarding");
  await page.getByRole("button", { name: /how they communicate/i }).click();
  await expect(page.getByText("From Marcus's input history")).toBeVisible({ timeout: 20000 });
});

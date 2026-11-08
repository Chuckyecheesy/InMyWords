import { expect, test, type Page, type Request } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * T3.4 in the browser: seven chapters, show_choices returns the tapped label,
 * answers survive a reload through the profile server, and a long press
 * speaks the picture name. Narration stays silent until a later approval.
 */

function elevenLabsConfigured(): boolean {
  if (process.env.ELEVENLABS_ID?.trim()) return true;
  try {
    const text = readFileSync(path.resolve(__dirname, "../../.env"), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("ELEVENLABS_ID=")) continue;
      const value = trimmed.slice("ELEVENLABS_ID=".length).trim().replace(/^['"]|['"]$/g, "");
      return value.length > 0;
    }
  } catch {
    return false;
  }
  return false;
}

function calls(requests: Request[], fragment: string) {
  return requests.filter((request) => request.url().includes(fragment) && request.method() === "POST");
}

async function openInterview(page: Page) {
  await page.goto("/resident/marcus/story/interview");
  await expect(page.getByRole("heading", { name: "Which chapter?" })).toBeVisible();
}

test.describe("T3.4 picture interview", () => {
  test("agent receives the confirmed label and chapters save through reload", async ({ page }) => {
    const posts: Request[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") posts.push(request);
    });

    await openInterview(page);
    const chapters = page.locator("[data-chapter]");
    await expect(chapters).toHaveCount(7);

    const returned = page.evaluate(async () => {
      const tool = (window as unknown as {
        showChoices?: (input: {
          question: string;
          options: { label: string; photo_id: string }[];
        }) => Promise<string>;
      }).showChoices;
      if (!tool) throw new Error("showChoices is not registered");
      return tool({
        question: "Where should we go?",
        options: [
          { label: "Park day", photo_id: "tiles/marcus_park" },
          { label: "The bus", photo_id: "tiles/marcus_bus" },
        ],
      });
    });
    await expect(page.getByRole("heading", { name: "Where should we go?" })).toBeVisible();
    await page.getByRole("button", { name: "Park day", exact: true }).click();
    await page.getByRole("button", { name: "Save this answer" }).click();
    expect(await returned).toBe("Park day");
    expect(calls(posts, "/story/answer")).toHaveLength(0);
    expect(calls(posts, "/speak")).toHaveLength(0);

    await page.getByRole("button", { name: "People who matter" }).click();
    await expect(page.getByRole("heading", { name: "Who do you want to see?" })).toBeVisible();
    const box = await page.getByRole("button", { name: "Lisa", exact: true }).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(64);
    expect(box?.height).toBeGreaterThanOrEqual(64);

    const speakResponse = page.waitForResponse((response) =>
      response.url().includes("/speak") && response.request().method() === "POST",
    );
    const lisa = page.getByRole("button", { name: "Lisa", exact: true });
    await lisa.dispatchEvent("pointerdown", { button: 0, pointerType: "mouse" });
    await page.waitForTimeout(750);
    await lisa.dispatchEvent("pointerup");
    await lisa.dispatchEvent("click");
    const spoken = await speakResponse;
    expect(spoken.ok()).toBeTruthy();
    const speakBody = spoken.request().postDataJSON() as { text: string; resident_id: string };
    expect(speakBody).toMatchObject({ resident_id: "marcus", text: "Lisa" });
    const speakJson = (await spoken.json()) as { audio_url: string; cached: boolean };
    const live = elevenLabsConfigured();
    if (live) {
      expect(speakJson.audio_url).toContain("/audio/");
      expect(speakJson.audio_url).not.toContain("example.com");
      const audio = await page.request.get(speakJson.audio_url);
      expect(audio.ok()).toBeTruthy();
      const bytes = Buffer.from(await audio.body());
      const id3 = bytes.subarray(0, 3).toString("utf8") === "ID3";
      const frame = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
      expect(id3 || frame).toBeTruthy();
      const again = await page.request.post("http://127.0.0.1:8000/speak", {
        data: { resident_id: "marcus", text: "Lisa" },
      });
      expect(again.ok()).toBeTruthy();
      const cached = (await again.json()) as { cached: boolean };
      expect(cached.cached).toBeTruthy();
    } else {
      expect(speakJson.audio_url).toContain("example.com/audio/mock_marcus.mp3");
      expect(speakJson.cached).toBe(false);
    }
    await expect(page.locator("audio")).toHaveAttribute("src", speakJson.audio_url);
    await expect(lisa).toHaveAttribute("aria-pressed", "false");

    await lisa.click();
    await page.getByRole("button", { name: "Save this answer" }).click();
    await page.getByRole("button", { name: "Tea", exact: true }).click();
    await page.getByRole("button", { name: "Save this answer" }).click();
    await page.getByRole("button", { name: "Quiet helps", exact: true }).click();
    await page.getByRole("button", { name: "Save this answer" }).click();

    await expect(page.getByRole("heading", { name: "People who matter" })).toBeVisible();
    await expect(page.getByText("Nothing has been read aloud yet.")).toBeVisible();
    await expect(page.getByText("Lisa").last()).toBeVisible();
    expect(calls(posts, "/story/draft")).toHaveLength(0);
    expect(calls(posts, "/story/approve")).toHaveLength(0);
    expect(calls(posts, "/speak").length).toBeGreaterThanOrEqual(1);

    await page.reload();
    await expect(page.getByRole("heading", { name: "Which chapter?" })).toBeVisible();
    const stored = await page.request.get(
      "http://127.0.0.1:8000/story/marcus/answers?chapter=people_who_matter",
    );
    expect(stored.ok()).toBeTruthy();
    const body = (await stored.json()) as { answers: { question: string; answer: string }[] };
    expect(body.answers.map((item) => item.answer)).toEqual(["Lisa", "Tea", "Quiet helps"]);
  });

  test("draft stays silent and approve speaks the answers", async ({ page }) => {
    test.skip(!elevenLabsConfigured(), "ELEVENLABS_ID is not set");
    const api = "http://127.0.0.1:8000";
    const chapter = "exec_day";
    const answers = [
      { question: "Morning drink?", answer: "Tea" },
      { question: "When it is loud?", answer: "Quiet" },
    ];
    for (const item of answers) {
      const saved = await page.request.post(`${api}/story/answer`, {
        data: { resident_id: "marcus", chapter, ...item },
      });
      expect(saved.ok()).toBeTruthy();
    }
    const replaced = await page.request.post(`${api}/story/answer`, {
      data: { resident_id: "marcus", chapter, question: "Morning drink?", answer: "Tea" },
    });
    expect(replaced.ok()).toBeTruthy();

    const drafted = await page.request.post(`${api}/story/draft`, {
      data: { resident_id: "marcus", chapter },
    });
    expect(drafted.ok()).toBeTruthy();
    const draftBody = (await drafted.json()) as { text: string; chapter_id: number; audio_url: string | null };
    expect(draftBody.audio_url).toBeNull();
    expect(draftBody.text.toLowerCase()).toContain("tea");
    expect(draftBody.text.toLowerCase()).toContain("quiet");
    expect(draftBody.text.toLowerCase()).not.toContain("raptors");
    expect(draftBody.text.toLowerCase()).not.toContain("double-double");

    const approved = await page.request.post(`${api}/story/approve`, {
      data: { chapter_id: draftBody.chapter_id },
    });
    expect(approved.ok()).toBeTruthy();
    const audio = (await approved.json()) as { audio_url: string; cached: boolean };
    expect(audio.audio_url).toContain("/audio/");
    expect(audio.audio_url).not.toContain("example.com");
    const file = await page.request.get(audio.audio_url);
    expect(file.ok()).toBeTruthy();
    const bytes = Buffer.from(await file.body());
    const id3 = bytes.subarray(0, 3).toString("utf8") === "ID3";
    const frame = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
    expect(id3 || frame).toBeTruthy();

    const second = await page.request.post(`${api}/story/approve`, {
      data: { chapter_id: draftBody.chapter_id },
    });
    expect(second.ok()).toBeTruthy();
    const replay = (await second.json()) as { cached: boolean; audio_url: string };
    expect(replay.cached).toBeTruthy();
    expect(replay.audio_url).toBe(audio.audio_url);

    await page.goto("/resident/marcus/story");
    await expect(page.getByText(draftBody.text).first()).toBeVisible();
    // Audio delivery is covered above (URL, bytes, cache); the page may attach src lazily on Play.
  });

  test("mobile width and high contrast still show the pictures", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openInterview(page);
    await page.getByRole("button", { name: "Display settings" }).click();
    await page.getByRole("button", { name: "High contrast" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "contrast");
    await page.getByRole("button", { name: "About me", exact: true }).click();
    await expect(page.getByRole("heading", { name: "What is a favourite memory?" })).toBeVisible();
    const pictures = page.locator("[data-choice]");
    await expect(pictures).toHaveCount(3);
    for (const choice of ["Bowling", "Family time", "The park"]) {
      const box = await page.getByRole("button", { name: choice, exact: true }).boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(64);
      expect(box?.width).toBeGreaterThanOrEqual(64);
    }
  });
});

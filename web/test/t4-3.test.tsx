/**
 * T4.3 acceptance tests. They fail until the work exists.
 *
 * T3 unblock — `components/shared.tsx` exports TileButton, BigButton,
 * and AudioPlayback.
 * Staff shell — pick a resident, open each staff route, come back.
 * Milestone 1 — Marcus's home: coffee + now → real POST /suggest →
 * approve → POST /speak audio and POST /sentences with approved true.
 * Nothing is spoken or saved before that approval. "now" is the time
 * field, not a tile. Speak-tiles-only speaks the tile words and skips
 * /suggest.
 */
import "./register-dom.ts";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, test } from "node:test";
import { createElement, type ComponentType, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { sampleResident } from "../lib/mock.ts";
import type { Resident, Tile } from "../lib/types.ts";

const API = "http://api.test";
const LONG_PRESS_MS = 600;
const QUIET = "I would like a quiet coffee.";
const DOUBLE_DOUBLE = "Can I get a double-double from Tim's?";
const PARK_LINE = "Coffee first, then the park?";
const TEA_LINE = "Tea instead, please.";

type Hit = { url: string; method: string; json: Record<string, unknown> | null };

const api = { hits: [] as Hit[] };
const originalFetch = globalThis.fetch;
const originalApiBase = process.env.API_BASE_URL;

type TileButtonProps = {
  tile: Tile;
  selected?: boolean;
  onSelect?: (tile: Tile) => void;
  onLongPress?: (label: string) => void;
};

type BigButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  onLongPress?: (label: string) => void;
  disabled?: boolean;
  tone?: "approve" | "reject" | "neutral";
};

type AudioPlaybackProps = {
  src: string;
  label?: string;
  autoPlay?: boolean;
};

type Shared = {
  TileButton: ComponentType<TileButtonProps>;
  BigButton: ComponentType<BigButtonProps>;
  AudioPlayback: ComponentType<AudioPlaybackProps>;
};

type SpeakForMeProps = { resident: Resident };

function isComponent(value: unknown): value is ComponentType<never> {
  if (typeof value === "function") return true;
  return !!value && typeof value === "object" && "$$typeof" in value;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadShared(): Promise<Shared> {
  let mod: Record<string, unknown>;
  try {
    mod = await import("../components/shared.tsx");
  } catch (error) {
    throw new Error(
      `T3 is still blocked: components/shared.tsx is not importable (${message(error)})`,
    );
  }
  for (const name of ["TileButton", "BigButton", "AudioPlayback"] as const) {
    if (!isComponent(mod[name])) {
      throw new Error(`T3 is still blocked: shared.tsx does not export ${name}`);
    }
  }
  return mod as unknown as Shared;
}

async function loadSpeak(): Promise<ComponentType<SpeakForMeProps>> {
  try {
    const mod = await import("../components/SpeakForMe.tsx");
    if (!isComponent(mod.SpeakForMe)) {
      throw new Error("export function SpeakForMe");
    }
    return mod.SpeakForMe as ComponentType<SpeakForMeProps>;
  } catch (error) {
    throw new Error(
      `Milestone 1 needs components/SpeakForMe.tsx exporting SpeakForMe. ${message(error)}`,
    );
  }
}

function marcus(): Resident {
  const resident = sampleResident("marcus");
  if (!resident) throw new Error("Marcus sample is missing");
  return resident;
}

function coffeeTile(): Tile {
  const tile = marcus().tiles.find((item) => item.label === "coffee");
  if (!tile) throw new Error("Marcus sample has no coffee tile");
  return tile;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function useFetch(handler: (hit: Hit) => Response | Promise<Response>) {
  api.hits = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let body: Record<string, unknown> | null = null;
    if (typeof init?.body === "string" && init.body) {
      body = JSON.parse(init.body) as Record<string, unknown>;
    }
    const hit = { url, method: (init?.method ?? "GET").toUpperCase(), json: body };
    api.hits.push(hit);
    return handler(hit);
  };
}

function calls(pathname: string): Hit[] {
  return api.hits.filter((hit) => {
    try {
      return new URL(hit.url).pathname === pathname;
    } catch {
      return false;
    }
  });
}

function audioUrlFor(text: string): string {
  return `https://audio.test/${encodeURIComponent(text)}.mp3`;
}

function liveApi(options: string[]) {
  useFetch((hit) => {
    const pathname = new URL(hit.url).pathname;
    if (pathname === "/suggest") return json({ options });
    if (pathname === "/speak") {
      return json({ audio_url: audioUrlFor(String(hit.json?.text ?? "")) });
    }
    if (pathname === "/sentences") return json({ id: "sentence-1" });
    if (pathname.startsWith("/residents/")) {
      const id = decodeURIComponent(pathname.slice("/residents/".length));
      const resident = sampleResident(id);
      return resident ? json(resident) : new Response("missing", { status: 404 });
    }
    return new Response("not mocked", { status: 404 });
  });
}

function user() {
  return userEvent.setup({ delay: null });
}

async function hold(target: Element) {
  fireEvent.pointerDown(target);
  await new Promise((resolve) => setTimeout(resolve, LONG_PRESS_MS + 50));
  fireEvent.pointerUp(target);
  fireEvent.click(target);
}

function watchPlayback() {
  const played: string[] = [];
  const original = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
    played.push(this.getAttribute("src") ?? "");
    return Promise.resolve();
  };
  return {
    played,
    stop() {
      HTMLMediaElement.prototype.play = original;
    },
  };
}

async function renderSpeak(options: string[]) {
  const SpeakForMe = await loadSpeak();
  liveApi(options);
  render(createElement(SpeakForMe, { resident: marcus() }));
  return user();
}

async function chooseCoffeeAndNow(pointer: ReturnType<typeof user>) {
  await pointer.click(screen.getByRole("button", { name: "coffee" }));
  await pointer.click(screen.getByRole("button", { name: "now" }));
}

function suggestionsRegion() {
  return screen.getByRole("region", { name: "Suggestions" });
}

describe("T4.3", { concurrency: false }, () => {
  beforeEach(() => {
    process.env.API_BASE_URL = API;
    liveApi([QUIET, "Coffee, please."]);
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    if (originalApiBase === undefined) delete process.env.API_BASE_URL;
    else process.env.API_BASE_URL = originalApiBase;
  });

  describe("shared components unblock T3", { concurrency: false }, () => {
    test("TileButton is a pressable tile named by its label", async () => {
      const { TileButton } = await loadShared();
      let selected: Tile | null = null;
      render(
        createElement(TileButton, {
          tile: coffeeTile(),
          selected: false,
          onSelect: (tile) => {
            selected = tile;
          },
        }),
      );
      const button = screen.getByRole("button", { name: "coffee", pressed: false });
      assert.equal(button.getAttribute("type"), "button");
      assert.ok(
        button.querySelector(".tile-face"),
        "TileButton should use the shared .tile-face so the photo tile stays at least 148px",
      );
      await user().click(button);
      assert.equal(selected?.label, "coffee");

      cleanup();
      render(
        createElement(TileButton, {
          tile: coffeeTile(),
          selected: true,
          onSelect: () => {},
        }),
      );
      screen.getByRole("button", { name: "coffee", pressed: true });
    });

    test("a 600ms pointer hold on a tile speaks the label and does not select it", async () => {
      const { TileButton } = await loadShared();
      let selected = 0;
      let heard = "";
      render(
        createElement(TileButton, {
          tile: coffeeTile(),
          onSelect: () => {
            selected += 1;
          },
          onLongPress: (label) => {
            heard = label;
          },
        }),
      );
      await hold(screen.getByRole("button", { name: "coffee" }));
      assert.equal(heard, "coffee");
      assert.equal(selected, 0, "a long-press must not also toggle the tile");
    });

    test("BigButton runs its action, ignores a disabled press, and long-press does not click", async () => {
      const { BigButton } = await loadShared();
      let clicks = 0;
      let heard = "";
      const { rerender } = render(
        createElement(BigButton, {
          tone: "approve",
          onClick: () => {
            clicks += 1;
          },
          onLongPress: (label) => {
            heard = label;
          },
          children: "Approve",
        }),
      );
      const button = screen.getByRole("button", { name: "Approve" });
      assert.equal(button.getAttribute("type"), "button");
      assert.equal(button.getAttribute("data-tone"), "approve");
      assert.match(button.className, /\bbig-button\b/);
      await user().click(button);
      assert.equal(clicks, 1);

      await hold(button);
      assert.equal(heard, "Approve");
      assert.equal(clicks, 1, "a long-press must not also run the button action");

      rerender(
        createElement(BigButton, {
          tone: "reject",
          disabled: true,
          onClick: () => {
            clicks += 1;
          },
          children: "Reject",
        }),
      );
      const reject = screen.getByRole("button", { name: "Reject" });
      assert.equal(reject.hasAttribute("disabled"), true);
      await user()
        .click(reject)
        .then(
          () => {},
          () => {},
        );
      assert.equal(clicks, 1, "a disabled big button does not run its action");
    });

    test("big buttons use the 64px tap token", () => {
      const tokens = readFileSync(new URL("../app/tokens.css", import.meta.url), "utf8");
      const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
      assert.match(tokens, /--tap-min:\s*64px/);
      const blocks = css.match(/[^{}]+\{[^}]*\}/g) ?? [];
      const rule = blocks.find((block) => {
        const head = block.slice(0, block.indexOf("{"));
        return head.split(",").some((part) => part.trim() === ".big-button");
      });
      assert.ok(rule, "globals.css needs a .big-button rule");
      assert.match(rule ?? "", /min-height:\s*var\(--tap-min\)/);
      assert.match(rule ?? "", /min-width:\s*var\(--tap-min\)/);
    });

    test("AudioPlayback plays the given file and does not start unless asked", async () => {
      const { AudioPlayback } = await loadShared();
      const playback = watchPlayback();
      try {
        const src = audioUrlFor("hello");
        const { rerender } = render(createElement(AudioPlayback, { src }));
        const audio = document.querySelector("audio");
        assert.ok(audio, "AudioPlayback renders an audio element");
        assert.equal(audio?.getAttribute("src"), src);
        assert.equal(audio?.autoplay, false);
        assert.deepEqual(playback.played, []);
        await user().click(screen.getByRole("button", { name: "Play" }));
        assert.deepEqual(playback.played, [src]);

        const again = audioUrlFor("again");
        const before = playback.played.length;
        rerender(createElement(AudioPlayback, { src: again, autoPlay: true, label: "Hear it" }));
        assert.ok(playback.played.slice(before).includes(again), "autoPlay starts playback on mount");
        screen.getByRole("button", { name: "Hear it" });
      } finally {
        playback.stop();
      }
    });
  });

  describe("staff shell navigates", { concurrency: false }, () => {
    test("home offers the staff entrance", async () => {
      const { default: Home } = await import("../app/page.tsx");
      render(await Home());
      const staff = screen.getByRole("link", { name: "I'm staff" });
      assert.equal(staff.getAttribute("href"), "/staff");
    });

    test("pick-a-resident opens each person's staff shell", async () => {
      const { default: Staff } = await import("../app/staff/page.tsx");
      render(await Staff());
      assert.equal(
        screen.getByRole("link", { name: /Marcus/ }).getAttribute("href"),
        "/staff/marcus/onboarding",
      );
      assert.equal(
        screen.getByRole("link", { name: /Dana/ }).getAttribute("href"),
        "/staff/dana/onboarding",
      );
      assert.equal(
        screen.getByRole("link", { name: "Since last shift" }).getAttribute("href"),
        "/staff/handoff",
      );
      assert.equal(
        screen.getByRole("link", { name: "Activity log" }).getAttribute("href"),
        "/staff/activity",
      );
    });

    test("the staff shell marks the open page and addresses handoff and activity", async () => {
      const { PathnameContext } = await import(
        "next/dist/shared/lib/hooks-client-context.shared-runtime.js"
      );
      const { StaffNav } = await import("../components/StaffNav.tsx");
      function show(pathname: string, id: string) {
        cleanup();
        render(
          createElement(
            PathnameContext.Provider,
            { value: pathname },
            createElement(StaffNav, { id }),
          ),
        );
      }

      show("/staff/marcus/coach", "marcus");
      assert.equal(
        screen.getByRole("link", { name: "Onboarding" }).getAttribute("href"),
        "/staff/marcus/onboarding",
      );
      const coach = screen.getByRole("link", { name: "Coach" });
      assert.equal(coach.getAttribute("href"), "/staff/marcus/coach");
      assert.equal(coach.getAttribute("aria-current"), "page");
      assert.equal(
        screen.getByRole("link", { name: "Onboarding" }).getAttribute("aria-current"),
        null,
      );
      assert.equal(
        screen.getByRole("link", { name: "Since last shift" }).getAttribute("href"),
        "/staff/handoff?resident=marcus",
      );
      assert.equal(
        screen.getByRole("link", { name: "Activity" }).getAttribute("href"),
        "/staff/activity?resident=marcus",
      );

      show("/staff/handoff", "dana");
      assert.equal(
        screen.getByRole("link", { name: "Since last shift" }).getAttribute("aria-current"),
        "page",
      );
      assert.equal(
        screen.getByRole("link", { name: "Activity" }).getAttribute("href"),
        "/staff/activity?resident=dana",
      );
    });

    test("the shell links back to every resident and each destination renders", async () => {
      const { default: Layout } = await import("../app/staff/[id]/layout.tsx");
      render(
        await Layout({
          params: Promise.resolve({ id: "marcus" }),
          children: createElement("p", null, "Onboarding body"),
        }),
      );
      assert.equal(
        screen.getByRole("link", { name: "All residents" }).getAttribute("href"),
        "/staff",
      );
      screen.getByRole("navigation", { name: "Staff" });
      screen.getByText("Onboarding body");

      cleanup();
      const { default: Onboarding } = await import("../app/staff/[id]/onboarding/page.tsx");
      render(await Onboarding({ params: Promise.resolve({ id: "marcus" }) }));
      screen.getByRole("heading", { name: /Onboarding/ });

      cleanup();
      const { default: Coach } = await import("../app/staff/[id]/coach/page.tsx");
      render(await Coach({ params: Promise.resolve({ id: "marcus" }) }));
      screen.getByRole("heading", { name: /Ask the Coach/ });

      cleanup();
      const { default: Handoff } = await import("../app/staff/handoff/page.tsx");
      render(await Handoff({ searchParams: Promise.resolve({ resident: "marcus" }) }));
      screen.getByRole("heading", { name: "Since last shift" });
      assert.equal(
        screen.getByRole("link", { name: "Marcus" }).getAttribute("aria-current"),
        "page",
      );

      cleanup();
      const { default: Activity } = await import("../app/staff/activity/page.tsx");
      render(await Activity({ searchParams: Promise.resolve({ resident: "dana" }) }));
      screen.getByRole("heading", { name: "Activity log" });
      assert.equal(
        screen.getByRole("link", { name: "Dana" }).getAttribute("href"),
        "/staff/activity?resident=dana",
      );
    });
  });

  describe("milestone 1 uses real suggestions and audio", { concurrency: false }, () => {
    test("Marcus's home shows the speak controls on the tile grid", async () => {
      const { default: ResidentHome } = await import("../app/resident/[id]/page.tsx");
      render(await ResidentHome({ params: Promise.resolve({ id: "marcus" }) }));
      screen.getByRole("heading", { name: "Drinks" });
      screen.getByRole("button", { name: "coffee" });
      screen.getByRole("button", { name: "now" });
      screen.getByRole("button", { name: "Help me say it" });
      screen.getByRole("button", { name: /speak tiles only/i });
    });

    test("Help me say it posts coffee and time now, and does not speak yet", async () => {
      const pointer = await renderSpeak([DOUBLE_DOUBLE, QUIET]);
      const help = screen.getByRole("button", { name: "Help me say it" });
      await pointer.click(help).catch(() => {});
      assert.equal(calls("/suggest").length, 0, "Help me say it waits until a tile is chosen");
      await chooseCoffeeAndNow(pointer);
      assert.match(screen.getByRole("region", { name: "Sentence" }).textContent ?? "", /coffee/);
      assert.equal(screen.getByRole("button", { name: "now" }).getAttribute("aria-pressed"), "true");
      await pointer.click(screen.getByRole("button", { name: "Help me say it" }));
      const suggest = calls("/suggest");
      assert.equal(suggest.length, 1);
      assert.equal(suggest[0].method, "POST");
      assert.equal(suggest[0].url, `${API}/suggest`);
      assert.deepEqual(suggest[0].json, {
        resident_id: "marcus",
        tiles: ["coffee"],
        time: "now",
      });
      const region = suggestionsRegion();
      within(region).getByText(DOUBLE_DOUBLE);
      within(region).getByText(QUIET);
      assert.equal(within(region).getAllByRole("article").length, 2);
      assert.equal(screen.queryByText(PARK_LINE), null);
      assert.equal(calls("/speak").length, 0, "suggestions are not spoken before approval");
      assert.equal(calls("/sentences").length, 0, "suggestions are not saved before approval");
      assert.equal(document.querySelector("audio"), null);
    });

    test("three sentences from the API are all shown", async () => {
      const pointer = await renderSpeak([DOUBLE_DOUBLE, QUIET, TEA_LINE]);
      await chooseCoffeeAndNow(pointer);
      await pointer.click(screen.getByRole("button", { name: "Help me say it" }));
      const region = suggestionsRegion();
      assert.equal(within(region).getAllByRole("article").length, 3);
      within(region).getByText(TEA_LINE);
    });

    test("tiles stay up while suggestions are thinking", async () => {
      const SpeakForMe = await loadSpeak();
      let release: (response: Response) => void = () => {};
      const pending = new Promise<Response>((resolve) => {
        release = resolve;
      });
      useFetch((hit) => {
        if (new URL(hit.url).pathname === "/suggest") return pending;
        return new Response("not mocked", { status: 404 });
      });
      try {
        render(createElement(SpeakForMe, { resident: marcus() }));
        const pointer = user();
        await chooseCoffeeAndNow(pointer);
        await pointer.click(screen.getByRole("button", { name: "Help me say it" }));
        const status = await screen.findByRole("status");
        assert.match(status.textContent ?? "", /thinking/i);
        screen.getByRole("button", { name: "coffee" });
        screen.getByRole("heading", { name: "Drinks" });
        assert.equal(screen.queryByRole("button", { name: "Approve" }), null);
      } finally {
        release(json({ options: [QUIET, "Coffee, please."] }));
      }
    });

    test("Approve plays the API audio and logs the sentence", async () => {
      const playback = watchPlayback();
      try {
        const pointer = await renderSpeak([QUIET, "Coffee, please."]);
        await chooseCoffeeAndNow(pointer);
        await pointer.click(screen.getByRole("button", { name: "Help me say it" }));
        assert.equal(calls("/speak").length, 0);
        const card = screen.getByText(QUIET).closest("article");
        assert.ok(card, "each suggestion is an article");
        await pointer.click(within(card).getByRole("button", { name: "Approve" }));
        const speak = calls("/speak");
        assert.equal(speak.length, 1);
        assert.equal(speak[0].url, `${API}/speak`);
        assert.deepEqual(speak[0].json, { resident_id: "marcus", text: QUIET });
        const logged = calls("/sentences");
        assert.equal(logged.length, 1);
        assert.equal(logged[0].url, `${API}/sentences`);
        assert.deepEqual(logged[0].json, {
          resident_id: "marcus",
          tiles: ["coffee"],
          chosen_text: QUIET,
          approved: true,
        });
        const src = audioUrlFor(QUIET);
        const audio = document.querySelector("audio");
        assert.equal(audio?.getAttribute("src"), src);
        assert.ok(
          playback.played.includes(src) || audio?.autoplay === true,
          "the approved sentence starts playing",
        );
      } finally {
        playback.stop();
      }
    });

    test("Reject does not speak and does not save", async () => {
      const pointer = await renderSpeak([QUIET, "Coffee, please."]);
      await chooseCoffeeAndNow(pointer);
      await pointer.click(screen.getByRole("button", { name: "Help me say it" }));
      const card = screen.getByText(QUIET).closest("article");
      assert.ok(card);
      await pointer.click(within(card).getByRole("button", { name: "Reject" }));
      assert.equal(screen.queryByText(QUIET), null);
      screen.getByText("Coffee, please.");
      assert.equal(calls("/speak").length, 0);
      assert.equal(calls("/sentences").length, 0);
      assert.equal(document.querySelector("audio"), null);
    });

    test("tapping a suggestion previews it and does not log it", async () => {
      const playback = watchPlayback();
      try {
        const pointer = await renderSpeak([QUIET, "Coffee, please."]);
        await chooseCoffeeAndNow(pointer);
        await pointer.click(screen.getByRole("button", { name: "Help me say it" }));
        await pointer.click(screen.getByRole("button", { name: QUIET }));
        assert.deepEqual(calls("/speak")[0]?.json, { resident_id: "marcus", text: QUIET });
        assert.equal(calls("/sentences").length, 0);
        const src = audioUrlFor(QUIET);
        assert.equal(document.querySelector("audio")?.getAttribute("src"), src);
        assert.ok(playback.played.includes(src) || document.querySelector("audio")?.autoplay);
      } finally {
        playback.stop();
      }
    });

    test("Speak tiles only speaks the tile words, skips suggest, and logs them", async () => {
      const playback = watchPlayback();
      try {
        const pointer = await renderSpeak([QUIET]);
        await pointer.click(screen.getByRole("button", { name: "coffee" }));
        await pointer.click(screen.getByRole("button", { name: "tea" }));
        await pointer.click(screen.getByRole("button", { name: "now" }));
        await pointer.click(screen.getByRole("button", { name: /speak tiles only/i }));
        assert.equal(calls("/suggest").length, 0);
        assert.deepEqual(calls("/speak")[0]?.json, {
          resident_id: "marcus",
          text: "coffee tea",
        });
        assert.deepEqual(calls("/sentences")[0]?.json, {
          resident_id: "marcus",
          tiles: ["coffee", "tea"],
          chosen_text: "coffee tea",
          approved: true,
        });
        const src = audioUrlFor("coffee tea");
        assert.equal(document.querySelector("audio")?.getAttribute("src"), src);
        assert.ok(playback.played.includes(src) || document.querySelector("audio")?.autoplay);
      } finally {
        playback.stop();
      }
    });

    test("a long-press on a tile speaks that label and does not log a sentence", async () => {
      const playback = watchPlayback();
      try {
        await renderSpeak([QUIET]);
        await hold(screen.getByRole("button", { name: "coffee" }));
        assert.deepEqual(calls("/speak")[0]?.json, { resident_id: "marcus", text: "coffee" });
        assert.equal(calls("/sentences").length, 0);
        const src = audioUrlFor("coffee");
        assert.equal(document.querySelector("audio")?.getAttribute("src"), src);
        assert.ok(playback.played.includes(src) || document.querySelector("audio")?.autoplay);
      } finally {
        playback.stop();
      }
    });

    test("a failed suggest or speak invents nothing and saves nothing", async () => {
      const SpeakForMe = await loadSpeak();
      useFetch((hit) => {
        const pathname = new URL(hit.url).pathname;
        if (pathname === "/suggest" || pathname === "/speak") {
          return json({ detail: "no" }, 500);
        }
        return json({ id: "sentence-1" });
      });
      render(createElement(SpeakForMe, { resident: marcus() }));
      const pointer = user();
      await chooseCoffeeAndNow(pointer);
      await pointer.click(screen.getByRole("button", { name: "Help me say it" }));
      await screen.findByText("The API returned 500.");
      screen.getByRole("button", { name: "coffee" });
      assert.equal(screen.queryByRole("button", { name: "Approve" }), null);
      assert.equal(calls("/speak").length, 0);
      assert.equal(calls("/sentences").length, 0);

      cleanup();
      useFetch((hit) => {
        const pathname = new URL(hit.url).pathname;
        if (pathname === "/suggest") return json({ options: [QUIET, "Coffee, please."] });
        if (pathname === "/speak") return json({ detail: "no" }, 500);
        return json({ id: "sentence-1" });
      });
      render(createElement(SpeakForMe, { resident: marcus() }));
      const again = user();
      await chooseCoffeeAndNow(again);
      await again.click(screen.getByRole("button", { name: "Help me say it" }));
      const card = screen.getByText(QUIET).closest("article");
      assert.ok(card);
      await again.click(within(card).getByRole("button", { name: "Approve" }));
      await screen.findByText("The API returned 500.");
      assert.equal(calls("/sentences").length, 0, "a sentence is saved only after it is spoken");
      assert.equal(document.querySelector("audio"), null);
    });
  });
});

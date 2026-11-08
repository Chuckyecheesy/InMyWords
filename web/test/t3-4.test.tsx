/**
 * T3.4: PhotoChoiceGrid plus seven chapter templates.
 * A tap reports the label. A long press speaks the label and does not select.
 */
import "./register-dom.ts";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, test } from "node:test";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PhotoChoiceGrid } from "../components/PhotoChoiceGrid.tsx";
import {
  chapterTemplateErrors,
  questionsFor,
  STORY_CHAPTERS,
} from "../lib/story-chapters.ts";

afterEach(() => {
  cleanup();
});

const OPTIONS = [
  { label: "Bowling", photo_id: "tiles/marcus_bowling" },
  { label: "Family time", photo_id: "tiles/marcus_lisa" },
  { label: "The park", photo_id: "tiles/marcus_park" },
];

describe("T3.4 chapter templates", () => {
  test("seven chapters, each with 3 to 5 picture questions", () => {
    assert.deepEqual(chapterTemplateErrors(), []);
    assert.equal(STORY_CHAPTERS.length, 7);
    const about = questionsFor("marcus", "about_me");
    assert.equal(about[0].question, "What is a favourite memory?");
    assert.equal(about[0].options[0].photo_id, "tiles/marcus_bowling");
    assert.equal(questionsFor("dana", "my_day")[1].options[0].photo_id, "tiles/dana_groceries");
  });
});

describe("PhotoChoiceGrid", () => {
  test("renders one question and 2 to 4 picture buttons", () => {
    render(
      createElement(PhotoChoiceGrid, {
        question: "What is a favourite memory?",
        options: OPTIONS,
        onChoice: () => {},
      }),
    );
    assert.ok(screen.getByRole("heading", { name: "What is a favourite memory?" }));
    const buttons = screen.getAllByRole("button").filter((button) => button.dataset.choice);
    assert.equal(buttons.length, 3);
    assert.equal(buttons[0].getAttribute("aria-label"), "Bowling");
  });

  test("a tap reports the label", () => {
    const chosen: string[] = [];
    render(
      createElement(PhotoChoiceGrid, {
        question: "What is a favourite memory?",
        options: OPTIONS,
        onChoice: (label: string) => chosen.push(label),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Bowling" }));
    assert.deepEqual(chosen, ["Bowling"]);
    assert.equal(screen.getByRole("button", { name: "Bowling" }).getAttribute("aria-pressed"), "true");
    fireEvent.click(screen.getByRole("button", { name: "Choose again" }));
    assert.deepEqual(chosen, ["Bowling", ""]);
    assert.equal(screen.getByRole("button", { name: "Bowling" }).getAttribute("aria-pressed"), "false");
  });

  test("a long press speaks the label and does not select it", async () => {
    const chosen: string[] = [];
    const spoken: string[] = [];
    render(
      createElement(PhotoChoiceGrid, {
        question: "What is a favourite memory?",
        options: OPTIONS,
        onChoice: (label: string) => chosen.push(label),
        onLongPress: (label: string) => spoken.push(label),
      }),
    );
    const bowling = screen.getByRole("button", { name: "Bowling" });
    fireEvent.pointerDown(bowling, { button: 0, pointerType: "mouse" });
    await new Promise((resolve) => setTimeout(resolve, 700));
    fireEvent.pointerUp(bowling);
    fireEvent.click(bowling);
    assert.deepEqual(spoken, ["Bowling"]);
    assert.deepEqual(chosen, []);
    assert.equal(bowling.getAttribute("aria-pressed"), "false");
  });

  test("choice buttons keep the 64px tap target", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    const tokens = readFileSync(new URL("../app/tokens.css", import.meta.url), "utf8");
    assert.match(css, /\.choice-button\s*\{[^}]*min-height:\s*var\(--tap-min\)/s);
    assert.match(css, /\.choice-button\s*\{[^}]*min-width:\s*var\(--tap-min\)/s);
    assert.match(tokens, /--tap-min:\s*64px/);
  });
});

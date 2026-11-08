"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Volume2, WandSparkles } from "lucide-react";
import { logSentence, speak, suggestSentences } from "@/lib/api";
import type { Resident, Tile } from "@/lib/types";
import { Callout } from "./ui";
import { TileButton } from "./shared";

/** Roadmap Phase 4: an optional What -> Where -> When path to a sentence.
 *  Every step is skippable; free tile selection stays the default on the
 *  Speak screen. Nothing is spoken without the resident choosing it. */

const WHAT_CATEGORIES = new Set(["food & drink", "drinks", "food", "activities", "people", "things", "my cards"]);
const WHERE_CATEGORIES = new Set(["places"]);
const WHEN_WORDS = ["now", "soon", "today", "tonight", "tomorrow"];

type Step = "what" | "where" | "when" | "say";

export function GuidedBuilder({ resident }: { resident: Resident }) {
  const [step, setStep] = useState<Step>("what");
  const [picked, setPicked] = useState<string[]>([]);
  const [options, setOptions] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spoken, setSpoken] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const whatTiles = resident.tiles.filter((tile) => WHAT_CATEGORIES.has(tile.category));
  const whereTiles = resident.tiles.filter((tile) => WHERE_CATEGORIES.has(tile.category));

  function pick(tile: Tile, next: Step) {
    setPicked((current) => [...current, tile.label]);
    setStep(next);
  }

  async function helpMeSayIt(words: string[]) {
    setThinking(true);
    setStep("say");
    const result = await suggestSentences({ resident_id: resident.id, tiles: words, time: "" });
    setThinking(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOptions(result.data.options ?? []);
  }

  async function sayThis(text: string) {
    setError(null);
    const result = await speak({ resident_id: resident.id, text });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSpoken(text);
    if (audioRef.current) {
      audioRef.current.src = result.data.audio_url;
      try {
        await audioRef.current.play();
      } catch {
        /* silent environments still log */
      }
    }
    await logSentence({ resident_id: resident.id, tiles: picked, chosen_text: text, approved: true });
  }

  const stepIndex = { what: 1, where: 2, when: 3, say: 4 }[step];

  return (
    <div className="stack calibrate-page">
      <header className="page-head">
        <p className="eyebrow">Guide me</p>
        <h1>
          {step === "what" && "What do you want?"}
          {step === "where" && "Where?"}
          {step === "when" && "When?"}
          {step === "say" && "Say it"}
        </h1>
        <p className="lead">
          {picked.length > 0 ? `So far: ${picked.join(" + ")}` : "One question at a time. You can skip any step."}
        </p>
      </header>

      <ol className="teach-steps" aria-label="Steps">
        {["What", "Where", "When", "Say it"].map((label, index) => (
          <li key={label} data-state={index + 1 === stepIndex ? "active" : index + 1 < stepIndex ? "done" : "todo"}>
            <span className="teach-step-num" aria-hidden="true">{index + 1 < stepIndex ? "✓" : index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {step === "what" ? (
        <section className="card card-pad" aria-label="What do you want?">
          <div className="tile-grid">
            {whatTiles.map((tile) => (
              <TileButton key={tile.id} tile={tile} onSelect={(t) => pick(t, "where")} />
            ))}
          </div>
        </section>
      ) : null}

      {step === "where" ? (
        <section className="card card-pad" aria-label="Where?">
          <div className="tile-grid">
            {whereTiles.map((tile) => (
              <TileButton key={tile.id} tile={tile} onSelect={(t) => pick(t, "when")} />
            ))}
          </div>
          <div className="setup-actions">
            <button type="button" className="btn" data-variant="ghost" data-size="xl" onClick={() => setStep("when")}>
              Skip this
            </button>
          </div>
        </section>
      ) : null}

      {step === "when" ? (
        <section className="card card-pad" aria-label="When?">
          <div className="row" style={{ flexWrap: "wrap", gap: "var(--space-3)" }}>
            {WHEN_WORDS.map((word) => (
              <button
                key={word}
                type="button"
                className="btn"
                data-variant="soft"
                data-size="xl"
                onClick={() => {
                  const words = [...picked, word];
                  setPicked(words);
                  void helpMeSayIt(words);
                }}
              >
                {word}
              </button>
            ))}
          </div>
          <div className="setup-actions">
            <button type="button" className="btn" data-variant="ghost" data-size="xl" onClick={() => void helpMeSayIt(picked)}>
              Skip this
            </button>
          </div>
        </section>
      ) : null}

      {step === "say" ? (
        <section className="card card-pad" aria-label="Say it">
          {thinking ? <p className="note" role="status">Thinking…</p> : null}
          {error ? <Callout tone="error" role="alert">{error}</Callout> : null}
          <div className="stack">
            {options.map((option) => (
              <div key={option} className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <p style={{ margin: 0, fontWeight: 700 }}>{option}</p>
                <button type="button" className="btn" data-variant="primary" data-size="lg" onClick={() => void sayThis(option)}>
                  <Volume2 size={20} aria-hidden="true" /> Say this
                </button>
              </div>
            ))}
            {!thinking && picked.length > 0 ? (
              <button type="button" className="btn" data-variant="soft" data-size="xl" onClick={() => void sayThis(picked.join(" "))}>
                <Volume2 size={22} aria-hidden="true" /> Just say: {picked.join(" ")}
              </button>
            ) : null}
          </div>
          {spoken ? <p className="note" role="status">Spoken: &ldquo;{spoken}&rdquo;</p> : null}
          <div className="setup-actions">
            <button
              type="button"
              className="btn"
              data-variant="ghost"
              data-size="lg"
              onClick={() => {
                setPicked([]);
                setOptions([]);
                setSpoken(null);
                setStep("what");
              }}
            >
              Start again
            </button>
            <Link href={`/resident/${resident.id}/speak`} className="btn" data-variant="ghost" data-size="lg">
              Back to pictures
            </Link>
          </div>
        </section>
      ) : null}

      <WandSparkles size={1} aria-hidden="true" style={{ opacity: 0 }} />
      <audio ref={audioRef} />
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Delete, Eye, Volume2, WandSparkles } from "lucide-react";
import { logSentence, speak, suggestSentences } from "@/lib/api";
import { loadDraft, saveDraft } from "@/lib/draft";
import { buildVocabulary, suggestWords } from "@/lib/input/word-suggest";
import type { Resident } from "@/lib/types";
import { Callout } from "./ui";

const ROWS = ["abcdef", "ghijkl", "mnopqr", "stuvwx", "yz"];

/** Roadmap Phase 4: large letter board with personal word suggestions.
 *  Suggestions are tap-to-accept only; nothing is spoken without the
 *  resident pressing a speak control. */
export function TypeBoard({ resident }: { resident: Resident }) {
  const [typed, setTyped] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spoken, setSpoken] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Shared composer state (ROADMAP Phase 6): switching modes keeps the draft.
  // Loaded after mount, not in the initializer — localStorage would mismatch
  // the server-rendered empty strip.
  useEffect(() => {
    const draft = loadDraft(resident.id);
    if (draft) setTyped(draft);
  }, [resident.id]);
  useEffect(() => {
    saveDraft(resident.id, typed);
  }, [resident.id, typed]);

  const vocabulary = useMemo(
    () => buildVocabulary(resident.tiles.map((tile) => tile.label)),
    [resident.tiles],
  );
  const currentWord = typed.split(" ").at(-1) ?? "";
  const suggestions = suggestWords(currentWord, vocabulary);
  const words = typed.trim().split(/\s+/).filter(Boolean);

  function press(letter: string) {
    setTyped((value) => value + letter);
  }

  function acceptWord(word: string) {
    setTyped((value) => {
      const parts = value.split(" ");
      parts[parts.length - 1] = word;
      return parts.join(" ") + " ";
    });
  }

  async function play(text: string, save: boolean) {
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
        /* no audio device; text + log still work */
      }
    }
    if (save) {
      await logSentence({ resident_id: resident.id, tiles: words, chosen_text: text, approved: true });
    }
  }

  async function helpMeSayIt() {
    if (words.length === 0) return;
    setThinking(true);
    setOptions([]);
    const result = await suggestSentences({ resident_id: resident.id, tiles: words, time: "" });
    setThinking(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOptions(result.data.options ?? []);
  }

  return (
    <div className="stack calibrate-page">
      <header className="page-head">
        <p className="eyebrow">Typing</p>
        <h1>Type it out</h1>
        <p className="lead">Tap letters. Word ideas appear; tap one or keep spelling.</p>
      </header>

      <section className="card card-pad typed-strip" aria-label="What you typed">
        <p className="typed-text" aria-live="polite">{typed || "Nothing yet."}</p>
        <div className="row">
          <button type="button" className="btn" data-variant="soft" data-size="lg" onClick={() => setTyped((v) => v + " ")}>
            Space
          </button>
          <button type="button" className="btn" data-variant="soft" data-size="lg" onClick={() => setTyped((v) => v.slice(0, -1))}>
            <Delete size={20} aria-hidden="true" /> Back
          </button>
          <button type="button" className="btn" data-variant="ghost" data-size="lg" onClick={() => { setTyped(""); setOptions([]); }}>
            Clear
          </button>
        </div>
      </section>

      {suggestions.length > 0 ? (
        <section className="card card-pad" aria-label="Word ideas">
          <div className="row" style={{ flexWrap: "wrap", gap: "var(--space-2)" }}>
            {suggestions.map((word) => (
              <button key={word} type="button" className="btn" data-variant="soft" data-size="xl" onClick={() => acceptWord(word)}>
                {word}
              </button>
            ))}
            <button type="button" className="btn" data-variant="ghost" data-size="lg" onClick={() => acceptWord(currentWord)}>
              None of these
            </button>
          </div>
        </section>
      ) : null}

      <section className="card card-pad" aria-label="Letters">
        <div className="letter-board">
          {ROWS.map((row) => (
            <div key={row} className="letter-row">
              {row.split("").map((letter) => (
                <button key={letter} type="button" className="letter-key" onClick={() => press(letter)}>
                  {letter}
                </button>
              ))}
            </div>
          ))}
        </div>
      </section>

      {error ? <Callout tone="error" role="alert">{error}</Callout> : null}
      {thinking ? <p className="note" role="status">Thinking…</p> : null}

      {options.length > 0 ? (
        <section className="card card-pad" aria-label="Suggestions">
          <div className="stack">
            {options.map((option) => (
              <div key={option} className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <p style={{ margin: 0, fontWeight: 700 }}>{option}</p>
                <button type="button" className="btn" data-variant="primary" data-size="lg" onClick={() => void play(option, true)}>
                  <Volume2 size={20} aria-hidden="true" /> Say this
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="setup-actions" style={{ justifyContent: "flex-start" }}>
        <button type="button" className="btn" data-variant="primary" data-size="xl" disabled={words.length === 0 || thinking} onClick={() => void helpMeSayIt()}>
          <WandSparkles size={24} aria-hidden="true" />
          Help me say it
        </button>
        <button type="button" className="btn" data-variant="soft" data-size="xl" disabled={words.length === 0} onClick={() => void play(typed.trim(), true)}>
          <Volume2 size={24} aria-hidden="true" />
          Say my words
        </button>
        <Link href={`/resident/${resident.id}/type-eyes`} className="btn" data-variant="soft" data-size="lg">
          <Eye size={20} aria-hidden="true" />
          Type with my eyes
        </Link>
        <Link href={`/resident/${resident.id}/speak`} className="btn" data-variant="ghost" data-size="lg">
          Back to pictures
        </Link>
      </div>

      {spoken ? <p className="note" role="status">Spoken: &ldquo;{spoken}&rdquo;</p> : null}
      <audio ref={audioRef} />
    </div>
  );
}

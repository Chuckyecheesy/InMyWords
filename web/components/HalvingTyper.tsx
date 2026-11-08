"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Keyboard, Undo2 } from "lucide-react";
import { loadDraft, saveDraft } from "@/lib/draft";
import { ALPHABET, describeLetters, dwellsPerLetter, narrow, splitLetters } from "@/lib/input/halving";
import { useInputLayer } from "@/lib/input/use-input";
import type { Resident, Tile } from "@/lib/types";
import { CameraConsent } from "./CameraConsent";
import { GazeTileGrid } from "./GazeTileGrid";

/** Eye typing (ROADMAP Phase 6): alphabet-halving board. Each dwell halves
 *  the remaining letters (~5 dwells per letter). Reuses the shipped gaze
 *  stack: the resident's dwell_ms applies, the Pause tile is built into the
 *  grid, and tapping the halves works exactly like looking at them. */

export function HalvingTyper({ resident }: { resident: Resident }) {
  const { consent, setConsent, cameraOn, profile, log } = useInputLayer(resident.id);
  const [remaining, setRemaining] = useState<string[]>(ALPHABET);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    const draft = loadDraft(resident.id);
    if (draft) setTyped(draft);
  }, [resident.id]);
  useEffect(() => {
    saveDraft(resident.id, typed);
  }, [resident.id, typed]);

  const [firstHalf, secondHalf] = splitLetters(remaining);

  function choose(tile: Tile, holdMs: number) {
    const next = narrow(remaining, tile.id === "half-first" ? "first" : "second");
    log(holdMs > 0 ? "gaze" : "touch", "select", describeLetters(next), "confirmed", {
      holdMs: holdMs || undefined,
    });
    if (next.length === 1) {
      setTyped((value) => value + next[0]);
      setRemaining(ALPHABET);
    } else {
      setRemaining(next);
    }
  }

  const halves: Tile[] = [
    { id: "half-first", label: describeLetters(firstHalf), category: "controls", cloudinary_id: null },
    { id: "half-second", label: describeLetters(secondHalf), category: "controls", cloudinary_id: null },
  ];

  return (
    <div className="stack calibrate-page">
      <header className="page-head">
        <p className="eyebrow">Eye typing</p>
        <h1>Pick the side with your letter</h1>
        <p className="lead">
          Keep choosing the half that has your letter. A letter takes about {dwellsPerLetter()} looks.
          Touch works too, any time.
        </p>
      </header>

      <section className="card card-pad typed-strip" aria-label="What you typed">
        <p className="typed-text" aria-live="polite">{typed || "Nothing yet."}</p>
        <div className="row">
          <button
            type="button"
            className="btn"
            data-variant="soft"
            data-size="lg"
            disabled={typed.length === 0}
            onClick={() => setTyped((value) => value.slice(0, -1))}
          >
            <Undo2 size={20} aria-hidden="true" /> Undo letter
          </button>
          <button
            type="button"
            className="btn"
            data-variant="ghost"
            data-size="lg"
            disabled={remaining.length === ALPHABET.length}
            onClick={() => setRemaining(ALPHABET)}
          >
            Start the letter over
          </button>
        </div>
      </section>

      <CameraConsent residentId={resident.id} cameraOn={cameraOn} onChange={setConsent} />
      {consent && !cameraOn ? (
        <p className="note" role="status">Starting the camera…</p>
      ) : null}

      <GazeTileGrid tiles={halves} dwellMs={profile.dwell_ms} onSelect={choose} />

      <div className="setup-actions" style={{ justifyContent: "flex-start" }}>
        <Link href={`/resident/${resident.id}/type`} className="btn" data-variant="soft" data-size="xl">
          <Keyboard size={22} aria-hidden="true" />
          Back to the letter board
        </Link>
        <Link href={`/resident/${resident.id}/calibrate`} className="btn" data-variant="ghost" data-size="lg">
          <Eye size={20} aria-hidden="true" />
          Tune my eye tracking
        </Link>
      </div>
      <p className="note">
        Your words stay in the strip above when you switch boards. Say them from the letter board.
      </p>
    </div>
  );
}

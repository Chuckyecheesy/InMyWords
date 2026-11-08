"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Clock,
  Coffee,
  Crosshair,
  Eraser,
  Eye,
  Hand,
  LayoutGrid,
  MapPin,
  MessageCircle,
  MessageSquareText,
  RotateCcw,
  ShoppingBasket,
  Smile,
  Undo2,
  Users,
  Volume2,
  X,
} from "lucide-react";
import { logSentence, speak, suggestSentences } from "@/lib/api";
import { categoryLabel } from "@/lib/format";
import { onCustomGesture } from "@/lib/input/gestures";
import { useInputLayer } from "@/lib/input/use-input";
import { nextSelection, spokenSentence } from "@/lib/sentence";
import { BowlingIcon, categoryTint, type Icon } from "@/lib/pictograms";
import type { Resident, Tile } from "@/lib/types";
import { CameraConsent } from "./CameraConsent";
import { GazeTileGrid } from "./GazeTileGrid";
import { GestureHint } from "./GestureHint";
import { TileButton, TileFace } from "./shared";
import { SoundBars, ThinkingDots } from "./ui";

const CATEGORY_ORDER = [
  "food & drink",
  "drinks",
  "food",
  "activities",
  "people",
  "places",
  "feelings",
  "errands",
  "answers",
  "words",
];

const CATEGORY_ICON: Record<string, Icon> = {
  "food & drink": Coffee,
  drinks: Coffee,
  food: Coffee,
  activities: BowlingIcon,
  people: Users,
  places: MapPin,
  feelings: Smile,
  errands: ShoppingBasket,
  answers: Check,
  words: MessageCircle,
};

function categoriesOf(tiles: Tile[]): string[] {
  const seen = [...new Set(tiles.map((tile) => tile.category))];
  return seen.sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

type Suggest =
  | { state: "idle" }
  | { state: "thinking" }
  | { state: "ready"; options: string[] }
  | { state: "error"; message: string };

type Playback = {
  src: string;
  text: string;
  kind: "approved" | "preview" | "label";
  state: "playing" | "done" | "failed";
};

/**
 * Long-press any button to hear its label in the resident's voice
 * (CLAUDE.md; enforced by test/t4-7-a11y). A hold never also clicks.
 */
function useHold(onHold: (label: string) => void) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  function clear() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }
  function down(label: string) {
    return (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      fired.current = false;
      clear();
      timer.current = window.setTimeout(() => {
        fired.current = true;
        onHold(label);
      }, 600);
    };
  }
  function consumed() {
    if (!fired.current) return false;
    fired.current = false;
    return true;
  }
  return { down, clear, consumed };
}

type Hold = ReturnType<typeof useHold>;

const FRIENDLY_SUGGEST_ERROR =
  "I couldn't think of sentences just now. Your pictures are still here.";
const FRIENDLY_SPEAK_ERROR = "The voice isn't working right now. Nothing was said or saved.";

export function SpeakForMe({ resident }: { resident: Resident }) {
  const [selected, setSelected] = useState<Tile[]>([]);
  const [limitNote, setLimitNote] = useState<string | null>(null);
  const [cleared, setCleared] = useState<Tile[] | null>(null);
  const [timeNow, setTimeNow] = useState(false);
  const [category, setCategory] = useState("all");
  const [suggest, setSuggest] = useState<Suggest>({ state: "idle" });
  const [review, setReview] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "approve" | "tiles" | null>(null);
  const [speakError, setSpeakError] = useState<string | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const categories = useMemo(() => categoriesOf(resident.tiles), [resident.tiles]);
  const visible =
    category === "all" ? resident.tiles : resident.tiles.filter((tile) => tile.category === category);
  const labels = selected.map((tile) => tile.label);
  const name = resident.name;
  const sentence = spokenSentence(labels, timeNow);
  const input = useInputLayer(resident.id);
  const hold = useHold((label) => void speakLabel(label));

  useEffect(() => {
    const node = audioRef.current;
    if (!node || !playback || playback.state !== "playing") return;
    void node.play().catch(() => {});
  }, [playback]);

  function resetSuggestions() {
    setSuggest({ state: "idle" });
    setSpeakError(null);
  }

  function toggleTile(tile: Tile, via: "touch" | "gaze" | "custom" = "touch", holdMs = 0) {
    const wasSelected = selected.some((item) => item.id === tile.id);
    const result = nextSelection(selected, tile);
    setCleared(null);
    resetSuggestions();
    setSelected(result.tiles);
    setLimitNote(result.note);
    if (via === "custom") {
      // A taught gesture selected its tile. Still only a selection:
      // nothing is spoken without the review step.
      input.log("gesture", "custom", tile.label, wasSelected ? "cancelled" : "confirmed", {
        gesture: `custom:${tile.label}`,
        confidence: 0.85,
      });
      return;
    }
    input.log(via, "select", tile.label, wasSelected ? "cancelled" : "confirmed", {
      holdMs,
      confidence: via === "gaze" ? 0.8 : 1,
    });
  }

  // Taught personal gestures select their tile (G8).
  useEffect(() => {
    if (!input.cameraOn) return;
    return onCustomGesture((label) => {
      const tile = resident.tiles.find((item) => item.label === label);
      if (tile) toggleTile(tile, "custom");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.cameraOn, resident.tiles, selected]);

  function removeTile(tile: Tile) {
    resetSuggestions();
    setLimitNote(null);
    setSelected((current) => current.filter((item) => item.id !== tile.id));
  }

  function clearAll() {
    if (selected.length === 0) return;
    setCleared(selected);
    setSelected([]);
    setLimitNote(null);
    setTimeNow(false);
    resetSuggestions();
    setPlayback(null);
  }

  function undoClear() {
    if (!cleared) return;
    setSelected(cleared);
    setCleared(null);
  }

  async function play(text: string, kind: Playback["kind"]): Promise<boolean> {
    const spoken = await speak({ resident_id: resident.id, text });
    if (!spoken.ok) return false;
    setPlayback({ src: spoken.data.audio_url, text, kind, state: "playing" });
    return true;
  }

  async function askForHelp() {
    if (labels.length === 0) return;
    setSpeakError(null);
    setSuggest({ state: "thinking" });
    const result = await suggestSentences({
      resident_id: resident.id,
      tiles: labels,
      time: timeNow ? "now" : "",
    });
    if (!result.ok) {
      setSuggest({ state: "error", message: FRIENDLY_SUGGEST_ERROR });
      return;
    }
    const options = (result.data.options ?? []).filter((line) => typeof line === "string" && line.trim());
    setSuggest({ state: "ready", options });
  }

  function reject(text: string, via: "touch" | "gesture" = "touch") {
    input.log(via, "cancel", "suggestion", "cancelled", {
      gesture: via === "gesture" ? "Open_Palm" : null,
      confidence: via === "gesture" ? 0.85 : 1,
    });
    setSuggest((current) =>
      current.state === "ready"
        ? { state: "ready", options: current.options.filter((line) => line !== text) }
        : current,
    );
  }

  function openReview(text: string, trigger: HTMLElement) {
    returnFocus.current = trigger;
    setSpeakError(null);
    setReview(text);
  }

  function closeReview() {
    setReview(null);
    setBusy(null);
    setSpeakError(null);
    requestAnimationFrame(() => returnFocus.current?.focus());
  }

  async function previewReview() {
    if (!review) return;
    setBusy("preview");
    setSpeakError(null);
    const ok = await play(review, "preview");
    setBusy(null);
    if (!ok) setSpeakError(FRIENDLY_SPEAK_ERROR);
  }

  /** The only path that speaks an AI sentence aloud and saves it. */
  async function approveReview(via: "touch" | "gesture" = "touch") {
    if (!review || busy) return;
    const text = review;
    input.log(via, "approve", "suggestion", "confirmed", {
      gesture: via === "gesture" ? "Thumb_Up" : null,
      confidence: via === "gesture" ? 0.85 : 1,
    });
    setBusy("approve");
    setSpeakError(null);
    const ok = await play(text, "approved");
    if (!ok) {
      setBusy(null);
      setSpeakError(FRIENDLY_SPEAK_ERROR);
      return;
    }
    await logSentence({ resident_id: resident.id, tiles: labels, chosen_text: text, approved: true });
    setBusy(null);
    setReview(null);
    setSuggest({ state: "idle" });
  }

  /** Speak the complete sentence the resident can read before approving. */
  async function speakTilesOnly() {
    if (labels.length === 0) return;
    const text = sentence;
    setBusy("tiles");
    setSpeakError(null);
    const ok = await play(text, "approved");
    setBusy(null);
    if (!ok) {
      setSpeakError(FRIENDLY_SPEAK_ERROR);
      return;
    }
    await logSentence({ resident_id: resident.id, tiles: labels, chosen_text: text, approved: true });
  }

  async function speakLabel(label: string) {
    const ok = await play(label, "label");
    if (!ok) setSpeakError(FRIENDLY_SPEAK_ERROR);
  }

  function replay() {
    if (!playback) return;
    setPlayback({ ...playback, state: "playing" });
    const node = audioRef.current;
    if (node) {
      node.currentTime = 0;
      void node.play().catch(() => {});
    }
  }

  function startOver() {
    setSelected([]);
    setLimitNote(null);
    setCleared(null);
    setTimeNow(false);
    resetSuggestions();
    setPlayback(null);
  }

  const thinking = suggest.state === "thinking";

  const inputError = input.consent && input.error ? (
        <div className="input-error" role="status">
          <p className="note">{input.error}</p>
          <button type="button" className="btn" data-longpress="own"
            onPointerDown={hold.down("Try camera again")}
            onPointerUp={hold.clear} onPointerLeave={hold.clear} onPointerCancel={hold.clear}
            onClick={() => { if (!hold.consumed()) input.retry(); }}>Try camera again</button>
        </div>
      ) : null;

  return (
    <div className="speak">
      <div className="speak-intro">
        <h1>What do you want to say?</h1>
        <p>Pick pictures, then tap <strong>Help me say it</strong>. You choose what is spoken.</p>
      </div>

      <section className="composer" aria-label="Sentence">
        <div className="composer-main">
        <div className="composer-strip">
          {selected.length === 0 ? (
            cleared ? (
              <button
                type="button"
                className="btn"
                data-variant="soft"
                data-size="lg"
                data-longpress="own"
                onPointerDown={hold.down("Undo clear")}
                onPointerUp={hold.clear}
                onPointerLeave={hold.clear}
                onPointerCancel={hold.clear}
                onClick={() => !hold.consumed() && undoClear()}
              >
                <Undo2 size={22} aria-hidden="true" />
                Undo clear
              </button>
            ) : (
              <p className="composer-empty">
                <MessageSquareText size={26} aria-hidden="true" />
                Tap pictures to start
              </p>
            )
          ) : (
            <ol className="fragments" aria-label="Your pictures">
              {selected.map((tile) => (
                <li key={tile.id} className="fragment">
                  <span className="fragment-pic" style={{ ["--tint" as string]: categoryTint(tile.category) }} aria-hidden="true">
                    <TileFace tile={tile} iconSize={30} />
                  </span>
                  <span>{tile.label}</span>
                  <button
                    type="button"
                    className="fragment-x"
                    aria-label={`Remove ${tile.label}`}
                    data-longpress="own"
                    onPointerDown={hold.down(`Remove ${tile.label}`)}
                    onPointerUp={hold.clear}
                    onPointerLeave={hold.clear}
                    onPointerCancel={hold.clear}
                    onClick={() => !hold.consumed() && removeTile(tile)}
                  >
                    <X size={24} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ol>
          )}
          <details className="speak-disclosure speak-time">
            <summary>Add a time{timeNow ? ": now" : ""}</summary>
          <button
            type="button"
            className="time-chip"
            aria-pressed={timeNow}
            data-longpress="own"
            onPointerDown={hold.down("Now")}
            onPointerUp={hold.clear}
            onPointerLeave={hold.clear}
            onPointerCancel={hold.clear}
            onClick={() => {
              if (hold.consumed()) return;
              resetSuggestions();
              setTimeNow((value) => !value);
            }}
          >
            <Clock size={24} aria-hidden="true" />
            Now
          </button>
          </details>
        </div>
        {sentence || limitNote ? (
          <p className="composer-sentence">
            {sentence ? <span>{sentence}</span> : null}
            {limitNote ? <span className="composer-note">{limitNote}</span> : null}
          </p>
        ) : null}
        </div>
        <div className="composer-actions">
          <details className="speak-disclosure speak-extra-actions">
            <summary>More options</summary>
            <div className="row">
          <button
            type="button"
            className="big-button"
            data-tone="neutral"
            disabled={selected.length === 0}
            onPointerDown={hold.down("Clear")}
            onPointerUp={hold.clear}
            onPointerLeave={hold.clear}
            onPointerCancel={hold.clear}
            onClick={() => !hold.consumed() && clearAll()}
            aria-label="Clear all pictures"
          >
            <Eraser size={24} aria-hidden="true" />
            Clear
          </button>
          <button
            type="button"
            className="big-button"
            data-tone="neutral"
            disabled={selected.length === 0 || busy !== null}
            onPointerDown={hold.down("Say my words")}
            onPointerUp={hold.clear}
            onPointerLeave={hold.clear}
            onPointerCancel={hold.clear}
            onClick={() => !hold.consumed() && void speakTilesOnly()}
          >
            <Volume2 size={24} aria-hidden="true" />
            Say my words
          </button>
            </div>
          </details>
          <button
            type="button"
            className="big-button"
            data-tone="approve"
            disabled={selected.length === 0 || thinking}
            onPointerDown={hold.down("Help me say it")}
            onPointerUp={hold.clear}
            onPointerLeave={hold.clear}
            onPointerCancel={hold.clear}
            onClick={() => !hold.consumed() && void askForHelp()}
          >
            <MessageSquareText size={24} aria-hidden="true" />
            Help me say it
          </button>
        </div>
      </section>

      {playback ? (
        <div className="now-speaking" data-state={playback.state === "playing" ? (playback.kind === "preview" ? "preview" : undefined) : "done"} role="status">
          {playback.state === "playing" ? <SoundBars /> : <Check size={26} aria-hidden="true" />}
          <div className="now-speaking-text">
            <strong>&ldquo;{playback.text}&rdquo;</strong>
            <span>
              {playback.state === "failed"
                ? "The audio didn't play. Nothing else was changed."
                : playback.kind === "preview"
                  ? playback.state === "playing"
                    ? "Preview, not saved."
                    : "Preview finished, not saved."
                  : playback.state === "playing"
                    ? `Speaking in ${name}'s voice…`
                    : `Said in ${name}'s voice.`}
            </span>
          </div>
          {playback.state !== "playing" && playback.kind !== "preview" ? (
            <>
              <button
                type="button"
                className="btn"
                data-size="lg"
                onPointerDown={hold.down("Say it again")}
                onPointerUp={hold.clear}
                onPointerLeave={hold.clear}
                onPointerCancel={hold.clear}
                onClick={() => !hold.consumed() && replay()}
              >
                <RotateCcw size={20} aria-hidden="true" />
                Say it again
              </button>
              {playback.kind === "approved" ? (
                <button
                  type="button"
                  className="btn"
                  data-size="lg"
                  onPointerDown={hold.down("New sentence")}
                  onPointerUp={hold.clear}
                  onPointerLeave={hold.clear}
                  onPointerCancel={hold.clear}
                  onClick={() => !hold.consumed() && startOver()}
                >
                  New sentence
                </button>
              ) : null}
            </>
          ) : null}
          <audio
            ref={audioRef}
            src={playback.src}
            autoPlay
            onEnded={() => setPlayback((current) => (current ? { ...current, state: "done" } : current))}
            onError={() => setPlayback((current) => (current ? { ...current, state: "failed" } : current))}
          />
        </div>
      ) : null}

      {speakError && !review ? (
        <div className="callout" data-tone="error" role="alert">
          <X size={20} aria-hidden="true" />
          <div className="callout-body">{speakError}</div>
        </div>
      ) : null}

      {suggest.state !== "idle" ? (
        <section className="suggestions" aria-label="Suggestions">
          {suggest.state === "thinking" ? (
            <>
              <p className="suggestions-head" role="status">
                <ThinkingDots /> Thinking of ways to say it…
              </p>
              <div className="suggestion-list" aria-hidden="true">
                <div className="skeleton suggestion-skeleton" />
                <div className="skeleton suggestion-skeleton" />
                <div className="skeleton suggestion-skeleton" />
              </div>
            </>
          ) : null}
          {suggest.state === "error" ? (
            <div className="callout" data-tone="error" role="alert">
              <X size={20} aria-hidden="true" />
              <div className="callout-body">
                <strong>{suggest.message}</strong>
                <div className="row" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn"
                    data-size="lg"
                    onPointerDown={hold.down("Try again")}
                    onPointerUp={hold.clear}
                    onPointerLeave={hold.clear}
                    onPointerCancel={hold.clear}
                    onClick={() => !hold.consumed() && void askForHelp()}
                  >
                    <RotateCcw size={20} aria-hidden="true" />
                    Try again
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {suggest.state === "ready" ? (
            suggest.options.length === 0 ? (
              <div className="callout">
                <MessageCircle size={20} aria-hidden="true" />
                <div className="callout-body">
                  No more ideas. Tap <strong>Help me say it</strong> for new ones, or <strong>Say my words</strong>.
                </div>
              </div>
            ) : (
              <>
                <p className="suggestions-head">Which one do you mean?</p>
                <GestureHint
                  enabled={input.cameraOn && !review}
                  onYes={() => {
                    const top = suggest.options[0];
                    if (top) {
                      returnFocus.current = null;
                      setSpeakError(null);
                      setReview(top);
                    }
                  }}
                  onNo={() => {
                    const top = suggest.options[0];
                    if (top) reject(top, "gesture");
                  }}
                />
                <div className="suggestion-list">
                  {suggest.options.map((text) => (
                    <article key={text} className="suggestion">
                      <button
                        type="button"
                        className="suggestion-line"
                        data-longpress="own"
                        onPointerDown={hold.down(text)}
                        onPointerUp={hold.clear}
                        onPointerLeave={hold.clear}
                        onPointerCancel={hold.clear}
                        onClick={(event) => {
                          if (hold.consumed()) return;
                          openReview(text, event.currentTarget);
                        }}
                      >
                        {text}
                      </button>
                      <div className="suggestion-foot">
                        <span className="suggestion-hint" aria-hidden="true">
                          Tap to check
                        </span>
                        <button
                          type="button"
                          className="big-button"
                          data-tone="reject"
                          aria-label={`Not this one: ${text}`}
                          data-longpress="own"
                          onPointerDown={hold.down("Not this one")}
                          onPointerUp={hold.clear}
                          onPointerLeave={hold.clear}
                          onPointerCancel={hold.clear}
                          onClick={() => !hold.consumed() && reject(text)}
                        >
                          <X size={20} aria-hidden="true" />
                          Not this one
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )
          ) : null}
        </section>
      ) : null}

      <details className="speak-disclosure">
        <summary>Use eyes or gestures</summary>
      <section className="input-row" aria-label="Eyes and hands">
        <CameraConsent residentId={resident.id} cameraOn={input.cameraOn} onChange={input.setConsent} />
        {input.consent ? (
          <div className="row">
            {!input.calibrationReady ? (
              <Link prefetch={false} href={`/resident/${resident.id}/calibrate`} className="btn" data-variant="secondary" data-size="lg">
                <Eye size={22} aria-hidden="true" /> Eye grid
              </Link>
            ) : (
            <button
              type="button"
              className="btn"
              data-variant="secondary"
              data-size="lg"
              aria-pressed={input.eyeMode}
              data-longpress="own"
              onPointerDown={hold.down(input.eyeMode ? "Touch grid" : "Eye grid")}
              onPointerUp={hold.clear}
              onPointerLeave={hold.clear}
              onPointerCancel={hold.clear}
              onClick={() => {
                if (hold.consumed()) return;
                input.setEyeMode(!input.eyeMode);
              }}
            >
              <Eye size={22} aria-hidden="true" />
              {input.eyeMode ? "Touch grid" : "Eye grid"}
            </button>
            )}
            <Link prefetch={false} href={`/resident/${resident.id}/calibrate`} className="btn" data-variant="ghost" data-size="lg">
              <Crosshair size={22} aria-hidden="true" />
              Set up my eyes
            </Link>
            <Link prefetch={false} href={`/resident/${resident.id}/teach`} className="btn" data-variant="ghost" data-size="lg">
              <Hand size={22} aria-hidden="true" />
              Teach a gesture
            </Link>
          </div>
        ) : null}
      </section>
      </details>

      {input.consent && input.status === "starting" ? <p role="status">Starting eye tracking...</p> : null}
      {input.status === "error" ? inputError : null}
      {input.consent && input.eyeMode && input.calibrationReady ? (
        <GazeTileGrid
          tiles={resident.tiles}
          dwellMs={input.profile.dwell_ms}
          cameraReady={input.cameraOn}
          onSelect={(tile, holdMs) => toggleTile(tile, holdMs > 0 ? "gaze" : "touch", holdMs)}
        />
      ) : (
      <div className="board">
        <nav className="cat-rail" aria-label="Picture groups">
          <button
            type="button"
            className="cat-btn"
            aria-pressed={category === "all"}
            data-longpress="own"
            onPointerDown={hold.down("All pictures")}
            onPointerUp={hold.clear}
            onPointerLeave={hold.clear}
            onPointerCancel={hold.clear}
            onClick={() => !hold.consumed() && setCategory("all")}
          >
            <span className="cat-swatch" aria-hidden="true">
              <LayoutGrid size={22} />
            </span>
            All pictures
          </button>
          {categories.map((key) => {
            const CatIcon = CATEGORY_ICON[key] ?? MessageCircle;
            return (
              <button
                key={key}
                type="button"
                className="cat-btn"
                aria-pressed={category === key}
                data-longpress="own"
                onPointerDown={hold.down(categoryLabel(key))}
                onPointerUp={hold.clear}
                onPointerLeave={hold.clear}
                onPointerCancel={hold.clear}
                onClick={() => !hold.consumed() && setCategory(key)}
              >
                <span className="cat-swatch" style={{ ["--tint" as string]: categoryTint(key) }} aria-hidden="true">
                  <CatIcon size={22} strokeWidth={1.9} />
                </span>
                {categoryLabel(key)}
              </button>
            );
          })}
        </nav>
        <section className="tile-area" aria-labelledby="tile-heading">
          <h2 id="tile-heading" className="tile-area-title">
            {category === "all" ? "All pictures" : categoryLabel(category)}
          </h2>
          <div className="tile-grid">
            {visible.map((tile) => (
              <TileButton
                key={tile.id}
                tile={tile}
                selected={selected.some((item) => item.id === tile.id)}
                onSelect={toggleTile}
                onLongPress={(label) => void speakLabel(label)}
              />
            ))}
          </div>
        </section>
      </div>
      )}

      {input.status !== "error" ? inputError : null}

      {review ? (
        <ReviewDialog
          text={review}
          tiles={selected}
          name={name}
          busy={busy}
          error={speakError}
          onPreview={() => void previewReview()}
          onApprove={() => void approveReview()}
          onCancel={closeReview}
          gestures={input.cameraOn}
          onGestureApprove={() => void approveReview("gesture")}
          hold={hold}
        />
      ) : null}
    </div>
  );
}

function ReviewDialog({
  text,
  tiles,
  name,
  busy,
  error,
  onPreview,
  onApprove,
  onCancel,
  gestures,
  onGestureApprove,
  hold,
}: {
  text: string;
  tiles: Tile[];
  name: string;
  busy: "preview" | "approve" | "tiles" | null;
  error: string | null;
  onPreview: () => void;
  onApprove: () => void;
  onCancel: () => void;
  gestures: boolean;
  onGestureApprove: () => void;
  hold: Hold;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled)");
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="modal-scrim">
      <div
        ref={dialogRef}
        className="modal review"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
        aria-describedby="review-sentence"
        onKeyDown={onKeyDown}
      >
        <h2 id="review-title" ref={headingRef} tabIndex={-1} className="eyebrow" style={{ fontSize: 16 }}>
          Is this what you want to say?
        </h2>
        <blockquote id="review-sentence" className="review-quote">
          &ldquo;{text}&rdquo;
        </blockquote>
        {tiles.length > 0 ? (
          <div className="review-from">
            <span>From your pictures</span>
            {tiles.map((tile) => (
              <span key={tile.id} className="mini-frag">
                <span style={{ ["--tint" as string]: categoryTint(tile.category) }} aria-hidden="true">
                  <TileFace tile={tile} iconSize={18} />
                </span>
                {tile.label}
              </span>
            ))}
          </div>
        ) : null}

        {error ? (
          <div className="callout" data-tone="error" role="alert">
            <X size={20} aria-hidden="true" />
            <div className="callout-body">{error}</div>
          </div>
        ) : null}

        <div className="review-actions">
          <button
            type="button"
            className="btn"
            data-variant="secondary"
            data-size="xl"
            disabled={busy !== null}
            data-longpress="own"
            onPointerDown={hold.down("Preview")}
            onPointerUp={hold.clear}
            onPointerLeave={hold.clear}
            onPointerCancel={hold.clear}
            onClick={() => !hold.consumed() && onPreview()}
          >
            {busy === "preview" ? <span className="spinner" aria-hidden="true" /> : <Volume2 size={24} aria-hidden="true" />}
            Preview
          </button>
          <button
            type="button"
            className="btn"
            data-variant="primary"
            data-size="xl"
            disabled={busy !== null}
            data-longpress="own"
            onPointerDown={hold.down("Approve and speak")}
            onPointerUp={hold.clear}
            onPointerLeave={hold.clear}
            onPointerCancel={hold.clear}
            onClick={() => !hold.consumed() && onApprove()}
          >
            {busy === "approve" ? <span className="spinner" aria-hidden="true" /> : <Check size={26} strokeWidth={3} aria-hidden="true" />}
            Approve &amp; Speak
          </button>
          <button
            type="button"
            className="btn"
            data-variant="ghost"
            data-size="lg"
            disabled={busy === "approve"}
            data-longpress="own"
            onPointerDown={hold.down("Cancel")}
            onPointerUp={hold.clear}
            onPointerLeave={hold.clear}
            onPointerCancel={hold.clear}
            onClick={() => !hold.consumed() && onCancel()}
          >
            <X size={22} aria-hidden="true" />
            Cancel, choose another
          </button>
        </div>
        <GestureHint enabled={gestures} onYes={onGestureApprove} onNo={onCancel} />
        <p className="review-note">
          <Volume2 size={18} aria-hidden="true" />
          Preview plays it to check and saves nothing. Approve &amp; Speak says it out loud in {name}&apos;s voice.
        </p>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { logSentence, speak, suggestSentences } from "@/lib/api";
import { categoryLabel } from "@/lib/format";
import { onCustomGesture } from "@/lib/input/gestures";
import { useInputLayer } from "@/lib/input/use-input";
import { nextSelection, spokenSentence } from "@/lib/sentence";
import type { Resident, Tile } from "@/lib/types";
<<<<<<< HEAD
=======
import { CameraConsent } from "./CameraConsent";
import { GazeTileGrid } from "./GazeTileGrid";
import { GestureHint } from "./GestureHint";
>>>>>>> origin/main
import { AudioPlayback, BigButton, TileButton, useLongPress } from "./shared";

const CATEGORY_ORDER = [
  "drinks",
  "activities",
  "people",
  "places",
  "feelings",
  "errands",
  "words",
];

function groupTiles(tiles: Tile[]): [string, Tile[]][] {
  const groups = new Map<string, Tile[]>();
  for (const tile of tiles) {
    const list = groups.get(tile.category) ?? [];
    list.push(tile);
    groups.set(tile.category, list);
  }
  const ordered = [...groups.keys()].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return ordered.map((category) => [category, groups.get(category) ?? []]);
}

function SuggestionLine({
  text,
  onPreview,
  onLongPress,
}: {
  text: string;
  onPreview: (text: string) => void;
  onLongPress: (label: string) => void;
}) {
  const hold = useLongPress(onLongPress, text);
  return (
    <button
      type="button"
      className="suggestion-line"
      onPointerDown={hold.onPointerDown}
      onPointerUp={hold.onPointerUp}
      onPointerLeave={hold.onPointerLeave}
      onPointerCancel={hold.onPointerCancel}
      onClick={() => {
        if (hold.consumeClick()) return;
        onPreview(text);
      }}
    >
      {text}
    </button>
  );
}

export function SpeakForMe({ resident }: { resident: Resident }) {
  const [selected, setSelected] = useState<Tile[]>([]);
  const [timeNow, setTimeNow] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [spokenText, setSpokenText] = useState<string | null>(null);
  const [limitNote, setLimitNote] = useState<string | null>(null);

  const input = useInputLayer(resident.id);

  const selectedLabels = selected.map((tile) => tile.label);
  const sentence = spokenSentence(selectedLabels, timeNow);

  function toggleTile(tile: Tile, via: "touch" | "gaze" | "custom" = "touch", holdMs = 0) {
    const wasSelected = selected.some((item) => item.id === tile.id);
    const result = nextSelection(selected, tile);
    setSelected(result.tiles);
    setLimitNote(result.note);
    setSuggestions([]);
    if (via === "custom") {
      // G8: a taught gesture selected its tile — still just a selection;
      // nothing is spoken without the normal approval flow.
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

  // G8: taught personal gestures select their tile.
  useEffect(() => {
    if (!input.cameraOn) return;
    return onCustomGesture((label) => {
      const tile = resident.tiles.find((item) => item.label === label);
      if (tile) toggleTile(tile, "custom");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.cameraOn, resident.tiles, selected]);

  async function playAndMaybeLog(text: string, save: boolean) {
    setError(null);
    const spoken = await speak({ resident_id: resident.id, text });
    if (!spoken.ok) {
      setError(spoken.error);
      setAudioSrc(null);
      return false;
    }
    setSpokenText(text);
    setAudioSrc(spoken.data.audio_url);
    if (save) {
      await logSentence({
        resident_id: resident.id,
        tiles: selectedLabels,
        chosen_text: text,
        approved: true,
      });
    }
    return true;
  }

  async function askForHelp() {
    if (selectedLabels.length === 0) return;
    setError(null);
    setSuggestions([]);
    setThinking(true);
    const result = await suggestSentences({
      resident_id: resident.id,
      tiles: selectedLabels,
      time: timeNow ? "now" : "",
    });
    setThinking(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuggestions(result.data.options ?? []);
  }

  async function approve(text: string, via: "touch" | "gesture" = "touch") {
    input.log(via, "approve", "suggestion", "confirmed", {
      gesture: via === "gesture" ? "Thumb_Up" : null,
      confidence: via === "gesture" ? 0.85 : 1,
    });
    await playAndMaybeLog(text, true);
  }

  function reject(text: string, via: "touch" | "gesture" = "touch") {
    input.log(via, "cancel", "suggestion", "cancelled", {
      gesture: via === "gesture" ? "Open_Palm" : null,
      confidence: via === "gesture" ? 0.85 : 1,
    });
    setSuggestions((current) => current.filter((item) => item !== text));
  }

  async function preview(text: string) {
    await playAndMaybeLog(text, false);
  }

  async function speakTilesOnly() {
    if (selectedLabels.length === 0) return;
    const text = selectedLabels.join(" ");
    await playAndMaybeLog(text, true);
  }

  async function speakLabel(label: string) {
    await playAndMaybeLog(label, false);
  }

  return (
    <div className="stack speak-for-me">
      <section className="sentence" aria-label="Sentence">
        <h2>Sentence</h2>
        <p>{sentence || "No sentence yet."}</p>
        {limitNote ? <p className="note">{limitNote}</p> : null}
      </section>

      <CameraConsent
        residentId={resident.id}
        cameraOn={input.cameraOn}
        onChange={input.setConsent}
      />

      {input.consent ? (
        <div className="speak-actions">
          <BigButton
            tone="neutral"
            aria-pressed={input.eyeMode}
            onClick={() => input.setEyeMode(!input.eyeMode)}
          >
            {input.eyeMode ? "Touch grid" : "Eye grid"}
          </BigButton>
          <Link href={`/resident/${resident.id}/calibrate`} className="tile tile-button slim">
            <span className="tile-label">Set up my eyes</span>
          </Link>
          <Link href={`/resident/${resident.id}/teach`} className="tile tile-button slim">
            <span className="tile-label">Teach a gesture</span>
          </Link>
        </div>
      ) : null}

      <div className="speak-actions">
        <BigButton
          tone="neutral"
          onLongPress={(l) => void speakLabel(l)}
          disabled={selectedLabels.length === 0 || thinking}
          onLongPress={speakLabel}
          onClick={() => {
            void askForHelp();
          }}
        >
          Help me say it
        </BigButton>
        <BigButton
          tone="neutral"
          onLongPress={(l) => void speakLabel(l)}
          disabled={selectedLabels.length === 0}
          onLongPress={speakLabel}
          onClick={() => {
            void speakTilesOnly();
          }}
        >
          Speak tiles only
        </BigButton>
        <BigButton
          tone="neutral"
<<<<<<< HEAD
          onLongPress={(l) => void speakLabel(l)}
=======
          onLongPress={speakLabel}
>>>>>>> origin/main
          onClick={() => setTimeNow((value) => !value)}
          aria-pressed={timeNow}
        >
          now
        </BigButton>
      </div>

      {thinking ? (
        <p role="status" className="note">
          Thinking…
        </p>
      ) : null}
      {error ? <p className="note">{error}</p> : null}

      {suggestions.length > 0 ? (
        <section className="block" aria-label="Suggestions">
          <h2>Suggestions</h2>
          <GestureHint
            enabled={input.cameraOn}
            onYes={() => {
              const top = suggestions[0];
              if (top) void approve(top, "gesture");
            }}
            onNo={() => {
              const top = suggestions[0];
              if (top) reject(top, "gesture");
            }}
          />
          <div className="stack">
            {suggestions.map((text) => (
              <article key={text} className="option">
<<<<<<< HEAD
                <SuggestionLine text={text} onPreview={(t) => void preview(t)} onLongPress={(l) => void speakLabel(l)} />
                <div className="speak-actions">
                  <BigButton tone="approve" onLongPress={(l) => void speakLabel(l)} onClick={() => void approve(text)}>
                    Approve
                  </BigButton>
                  <BigButton tone="reject" onLongPress={(l) => void speakLabel(l)} onClick={() => reject(text)}>
=======
                <SuggestionLine text={text} onPreview={() => void preview(text)} onSpeak={() => void speakLabel(text)} />
                <div className="speak-actions">
                  <BigButton tone="approve" onLongPress={speakLabel} onClick={() => void approve(text)}>
                    Approve
                  </BigButton>
                  <BigButton tone="reject" onLongPress={speakLabel} onClick={() => reject(text)}>
>>>>>>> origin/main
                    Reject
                  </BigButton>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {audioSrc ? (
        <>
          <AudioPlayback
            src={audioSrc}
            autoPlay
            label="Play"
            transcript={spokenText ?? undefined}
          />
          <BigButton
            tone="neutral"
            onLongPress={speakLabel}
            onClick={() => {
              setAudioSrc(null);
              setSpokenText(null);
            }}
          >
            Undo
          </BigButton>
        </>
      ) : null}

      {input.consent && input.eyeMode ? (
        <GazeTileGrid
          tiles={resident.tiles}
          dwellMs={input.profile.dwell_ms}
          onSelect={(tile, holdMs) => toggleTile(tile, holdMs > 0 ? "gaze" : "touch", holdMs)}
        />
      ) : null}

      {input.eyeMode
        ? null
        : groupTiles(resident.tiles).map(([category, tiles]) => (
            <section key={category} className="block">
              <h2>{categoryLabel(category)}</h2>
              <div className="tile-grid">
                {tiles.map((tile) => (
                  <TileButton
                    key={tile.id}
                    tile={tile}
                    selected={selected.some((item) => item.id === tile.id)}
                    onSelect={(selectedTile) => toggleTile(selectedTile)}
                    onLongPress={(label) => {
                      void speakLabel(label);
                    }}
                  />
                ))}
              </div>
            </section>
          ))}
    </div>
  );
}

function SuggestionLine({
  text,
  onPreview,
  onSpeak,
}: {
  text: string;
  onPreview: () => void;
  onSpeak: () => void;
}) {
  const press = useLongPress(() => onSpeak(), text);
  return (
    <button
      type="button"
      className="suggestion-line"
      onPointerDown={press.onPointerDown}
      onPointerUp={press.onPointerUp}
      onPointerLeave={press.onPointerLeave}
      onPointerCancel={press.onPointerCancel}
      onClick={() => {
        if (press.consumeClick()) return;
        onPreview();
      }}
    >
      {text}
    </button>
  );
}

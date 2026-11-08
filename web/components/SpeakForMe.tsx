"use client";

import { useState } from "react";
import { logSentence, speak, suggestSentences } from "@/lib/api";
import { categoryLabel } from "@/lib/format";
import { nextSelection, spokenSentence } from "@/lib/sentence";
import type { Resident, Tile } from "@/lib/types";
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

export function SpeakForMe({ resident }: { resident: Resident }) {
  const [selected, setSelected] = useState<Tile[]>([]);
  const [timeNow, setTimeNow] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [spokenText, setSpokenText] = useState<string | null>(null);
  const [limitNote, setLimitNote] = useState<string | null>(null);

  const selectedLabels = selected.map((tile) => tile.label);
  const sentence = spokenSentence(selectedLabels, timeNow);

  function toggleTile(tile: Tile) {
    const result = nextSelection(selected, tile);
    setSelected(result.tiles);
    setLimitNote(result.note);
    setSuggestions([]);
  }

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

  async function approve(text: string) {
    await playAndMaybeLog(text, true);
  }

  function reject(text: string) {
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

      <div className="speak-actions">
        <BigButton
          tone="neutral"
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
          onLongPress={speakLabel}
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
          <div className="stack">
            {suggestions.map((text) => (
              <article key={text} className="option">
                <SuggestionLine text={text} onPreview={() => void preview(text)} onSpeak={() => void speakLabel(text)} />
                <div className="speak-actions">
                  <BigButton tone="approve" onLongPress={speakLabel} onClick={() => void approve(text)}>
                    Approve
                  </BigButton>
                  <BigButton tone="reject" onLongPress={speakLabel} onClick={() => reject(text)}>
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

      {groupTiles(resident.tiles).map(([category, tiles]) => (
        <section key={category} className="block">
          <h2>{categoryLabel(category)}</h2>
          <div className="tile-grid">
            {tiles.map((tile) => (
              <TileButton
                key={tile.id}
                tile={tile}
                selected={selected.some((item) => item.id === tile.id)}
                onSelect={toggleTile}
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

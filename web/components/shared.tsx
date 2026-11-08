"use client";

import {
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Check, Square, Volume2 } from "lucide-react";
import { DeliveredPhoto } from "@/components/DeliveredPhoto";
import { isDrawnPlaceholder } from "@/lib/demo-photos";
import { Pictogram, categoryTint, isPersonCategory, pictogramFor } from "@/lib/pictograms";
import type { Tile } from "@/lib/types";

const LONG_PRESS_MS = 600;

export function useLongPress(onLongPress?: (label: string) => void, label = "") {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  function clear() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    fired.current = false;
    clear();
    if (!onLongPress) return;
    timer.current = setTimeout(() => {
      fired.current = true;
      onLongPress(label);
    }, LONG_PRESS_MS);
  }

  function onPointerUp() {
    clear();
  }

  function onPointerLeave() {
    clear();
  }

  function onPointerCancel() {
    clear();
  }

  function consumeClick(): boolean {
    if (!fired.current) return false;
    fired.current = false;
    return true;
  }

  return {
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    consumeClick,
  };
}

function subscribeContrast(onChange: () => void) {
  window.addEventListener("imw-theme", onChange);
  const query = window.matchMedia("(prefers-contrast: more)");
  query.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("imw-theme", onChange);
    query.removeEventListener("change", onChange);
  };
}

function contrastIsOn() {
  const theme = document.documentElement.dataset.theme;
  if (theme === "contrast") return true;
  if (theme === "calm") return false;
  return window.matchMedia("(prefers-contrast: more)").matches;
}

function useContrastTheme() {
  return useSyncExternalStore(subscribeContrast, contrastIsOn, () => false);
}

/** Which face a tile shows: a real photo first (CLAUDE.md), then a pictogram,
 *  then a drawn placeholder photo, then a monogram for people, then the word. */
function faceKind(tile: Tile): "photo" | "pictogram" | "monogram" | "word" {
  const hasPhoto = Boolean(tile.cloudinary_id);
  if (hasPhoto && !isDrawnPlaceholder(tile.cloudinary_id)) return "photo";
  if (pictogramFor(tile.label)) return "pictogram";
  if (hasPhoto) return "photo";
  if (isPersonCategory(tile.category)) return "monogram";
  return "word";
}

export function TileFace({ tile, iconSize }: { tile: Tile; iconSize?: number }) {
  const contrast = useContrastTheme();
  const kind = faceKind(tile);
  if (kind === "photo") {
    return <DeliveredPhoto publicId={tile.cloudinary_id!} mode={contrast ? "contrast" : "calm"} className="tile-img" />;
  }
  if (kind === "pictogram") {
    return <Pictogram label={tile.label} className="tile-icon" size={iconSize} strokeWidth={1.75} aria-hidden="true" />;
  }
  if (kind === "monogram") {
    return (
      <span className="tile-monogram" aria-hidden="true">
        {tile.label.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <span className="tile-letter" aria-hidden="true">
      {tile.label}
    </span>
  );
}

export function TileButton({
  tile,
  selected = false,
  onSelect,
  onLongPress,
}: {
  tile: Tile;
  selected?: boolean;
  onSelect?: (tile: Tile) => void;
  onLongPress?: (label: string) => void;
}) {
  const longPress = useLongPress(onLongPress, tile.label);
  const showsWord = faceKind(tile) === "word";

  return (
    <button
      type="button"
      className={`tile tile-button${selected ? " is-selected" : ""}`}
      aria-pressed={selected}
      aria-label={tile.label}
      data-longpress="own"
      style={{ ["--tint" as string]: categoryTint(tile.category) }}
      onPointerDown={longPress.onPointerDown}
      onPointerUp={longPress.onPointerUp}
      onPointerLeave={longPress.onPointerLeave}
      onPointerCancel={longPress.onPointerCancel}
      onContextMenu={(event) => event.preventDefault()}
      onClick={() => {
        if (longPress.consumeClick()) return;
        onSelect?.(tile);
      }}
    >
      <div className="tile-face">
        <TileFace tile={tile} />
      </div>
      {showsWord ? null : <span className="tile-label">{tile.label}</span>}
      {selected ? (
        <span className="tile-check" aria-hidden="true">
          <Check size={22} strokeWidth={3} />
        </span>
      ) : null}
    </button>
  );
}

export function BigButton({
  children,
  onClick,
  onLongPress,
  disabled = false,
  tone = "neutral",
  "aria-pressed": ariaPressed,
}: {
  children: ReactNode;
  onClick?: () => void;
  onLongPress?: (label: string) => void;
  disabled?: boolean;
  tone?: "approve" | "reject" | "neutral";
  "aria-pressed"?: boolean;
}) {
  const label = typeof children === "string" ? children : "";
  const longPress = useLongPress(disabled ? undefined : onLongPress, label);

  return (
    <button
      type="button"
      className="big-button"
      data-tone={tone}
      data-longpress="own"
      disabled={disabled}
      aria-pressed={ariaPressed}
      onPointerDown={longPress.onPointerDown}
      onPointerUp={longPress.onPointerUp}
      onPointerLeave={longPress.onPointerLeave}
      onPointerCancel={longPress.onPointerCancel}
      onClick={() => {
        if (longPress.consumeClick()) return;
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

export function AudioPlayback({
  src,
  label = "Play",
  autoPlay = false,
  transcript,
  transcriptId,
}: {
  src: string;
  label?: string;
  autoPlay?: boolean;
  transcript?: string;
  transcriptId?: string;
}) {
  const generatedId = useId();
  const describedBy = transcriptId ?? (transcript ? generatedId : undefined);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const node = audioRef.current;
    if (!node) return;
    node.src = src;
    if (autoPlay) {
      void node.play().catch(() => {});
    }
  }, [src, autoPlay]);

  function stop() {
    const node = audioRef.current;
    if (!node) return;
    node.pause();
    node.currentTime = 0;
  }

  return (
    <div className="audio-playback">
      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        autoPlay={autoPlay}
        aria-describedby={describedBy}
      />
      {transcript && describedBy ? (
        <p id={describedBy} className="transcript" data-transcript="">
          {transcript}
        </p>
      ) : null}
      <div className="row">
        <button
          type="button"
          className="btn"
          data-variant="secondary"
          data-size="lg"
          onClick={() => {
            void audioRef.current?.play().catch(() => {});
          }}
        >
          <Volume2 size={22} aria-hidden="true" />
          {label}
        </button>
        <button type="button" className="btn" data-variant="ghost" data-size="lg" onClick={stop}>
          <Square size={18} aria-hidden="true" />
          Stop
        </button>
      </div>
    </div>
  );
}

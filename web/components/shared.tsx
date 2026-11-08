"use client";

import {
  useEffect,
  useId,
  useRef,
  type PointerEvent,
  type ReactNode,
} from "react";
import { tileImageUrl } from "@/lib/cloudinary";
import { DeliveredPhoto } from "@/components/DeliveredPhoto";
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
  const calm = tile.cloudinary_id ? tileImageUrl(tile.cloudinary_id, "calm") : null;
  const contrast = tile.cloudinary_id ? tileImageUrl(tile.cloudinary_id, "contrast") : null;

  return (
    <button
      type="button"
      className={`tile tile-button${selected ? " is-selected" : ""}`}
      aria-pressed={selected}
      aria-label={tile.label}
      onPointerDown={longPress.onPointerDown}
      onPointerUp={longPress.onPointerUp}
      onPointerLeave={longPress.onPointerLeave}
      onPointerCancel={longPress.onPointerCancel}
      onClick={() => {
        if (longPress.consumeClick()) return;
        onSelect?.(tile);
      }}
    >
      <div className="tile-face">
        {calm && contrast ? (
          <>
            <DeliveredPhoto publicId={tile.cloudinary_id!} mode="calm" className="tile-img tile-img-calm" />
            <DeliveredPhoto publicId={tile.cloudinary_id!} mode="contrast" className="tile-img tile-img-contrast" />
          </>
        ) : (
          <span className="tile-letter" aria-hidden="true">
            {tile.label}
          </span>
        )}
      </div>
      {calm ? <span className="tile-label">{tile.label}</span> : null}
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
      <div className="speak-actions">
        <BigButton
          tone="neutral"
          onClick={() => {
            void audioRef.current?.play().catch(() => {});
          }}
        >
          {label}
        </BigButton>
        <BigButton tone="neutral" onClick={stop}>
          Stop
        </BigButton>
      </div>
    </div>
  );
}

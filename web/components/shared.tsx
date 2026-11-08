"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { tileImageUrl } from "@/lib/cloudinary";
import type { Tile } from "@/lib/types";

const LONG_PRESS_MS = 600;

function useLongPress(onLongPress?: (label: string) => void, label = "") {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  function clear() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="tile-img tile-img-calm" src={calm} alt="" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="tile-img tile-img-contrast" src={contrast} alt="" />
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
}: {
  src: string;
  label?: string;
  autoPlay?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState(src);

  useEffect(() => {
    setCurrent(src);
  }, [src]);

  useEffect(() => {
    const node = audioRef.current;
    if (!node) return;
    node.src = current;
    if (autoPlay) {
      void node.play().catch(() => {});
    }
  }, [current, autoPlay]);

  return (
    <div className="audio-playback">
      <audio ref={audioRef} src={current} preload="auto" autoPlay={autoPlay} />
      <BigButton
        tone="neutral"
        onClick={() => {
          void audioRef.current?.play().catch(() => {});
        }}
      >
        {label}
      </BigButton>
    </div>
  );
}

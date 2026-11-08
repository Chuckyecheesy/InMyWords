"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DwellController, type Selection } from "@/lib/input/controller";
import { onGaze } from "@/lib/input/gaze";
import type { Tile } from "@/lib/types";
import { tileImageUrl } from "@/lib/cloudinary";

/**
 * 2×3 gaze grid with dwell rings (GAZE_GESTURE_PLAN §5): the resident's
 * top 5 tiles + a Pause tile. A ring fills clockwise over dwell_ms and
 * drains when the gaze leaves. Soft tick on selection.
 */

const PAUSE_TILE: Tile = { id: "__pause", label: "Pause", category: "controls", cloudinary_id: null };

function tick(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => void ctx.close();
  } catch {
    /* no audio is fine */
  }
}

export function GazeTileGrid({
  tiles,
  dwellMs,
  onSelect,
  onPauseChange,
}: {
  tiles: Tile[];
  dwellMs: number;
  onSelect: (tile: Tile, holdMs: number) => void;
  onPauseChange?: (paused: boolean) => void;
}) {
  const shown = [...tiles.slice(0, 5), PAUSE_TILE];
  const controller = useRef<DwellController | null>(null);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const [ring, setRing] = useState<{ tileId: string | null; progress: number }>({
    tileId: null,
    progress: 0,
  });
  const [paused, setPaused] = useState(false);
  const [gazeLost, setGazeLost] = useState(false);

  if (!controller.current) controller.current = new DwellController(dwellMs);
  controller.current.dwellMs = dwellMs;

  const measure = useCallback(() => {
    const ctl = controller.current!;
    ctl.clearTiles();
    for (const tile of shown) {
      const el = refs.current.get(tile.id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      ctl.registerTile({
        id: tile.id,
        label: tile.label,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        isPause: tile.id === PAUSE_TILE.id,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.map((t) => t.id).join(",")]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  useEffect(() => {
    const ctl = controller.current!;
    const unsubscribe = onGaze((point, lost) => {
      setGazeLost(lost);
      const now = performance.now();
      const selection: Selection | null = ctl.tick(point, now);
      const state = ctl.state(now);
      setRing((prev) =>
        prev.tileId === state.tileId && Math.abs(prev.progress - state.progress) < 0.02
          ? prev
          : { tileId: state.tileId, progress: state.progress },
      );
      if (selection) {
        tick();
        if (selection.isPause) {
          setPaused(true);
          onPauseChange?.(true);
        } else {
          const tile = shown.find((t) => t.id === selection.tileId);
          if (tile) onSelect(tile, selection.holdMs);
        }
      }
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSelect, onPauseChange, shown.map((t) => t.id).join(",")]);

  function resume() {
    controller.current?.resume();
    setPaused(false);
    onPauseChange?.(false);
  }

  return (
    <section className="block gaze-grid-wrap" aria-label="Eye grid">
      {gazeLost ? (
        <p className="note" role="status">
          I can’t see your eyes. Sit closer to the screen, with light on your face.
        </p>
      ) : null}
      {paused ? (
        <button type="button" className="tile tile-button gaze-resume" onClick={resume}>
          <span className="tile-label">Resume eye grid</span>
        </button>
      ) : (
        <div className="gaze-grid">
          {shown.map((tile) => {
            const active = ring.tileId === tile.id;
            const image = tile.cloudinary_id ? tileImageUrl(tile.cloudinary_id, "calm") : null;
            return (
              <button
                key={tile.id}
                type="button"
                className={`tile gaze-tile${active ? " is-fixating" : ""}`}
                ref={(el) => {
                  if (el) refs.current.set(tile.id, el);
                  else refs.current.delete(tile.id);
                }}
                aria-label={tile.label}
                onClick={() => {
                  // Touch always works too — same flow, logged as touch upstream.
                  if (tile.id === PAUSE_TILE.id) {
                    controller.current?.pause();
                    setPaused(true);
                    onPauseChange?.(true);
                  } else {
                    onSelect(tile, 0);
                  }
                }}
              >
                <svg className="dwell-ring" viewBox="0 0 100 100" aria-hidden="true">
                  <circle
                    cx="50"
                    cy="50"
                    r="46"
                    pathLength={100}
                    style={{
                      strokeDashoffset: active ? 100 - ring.progress * 100 : 100,
                    }}
                  />
                </svg>
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt="" className="gaze-tile-photo" />
                ) : null}
                <span className="tile-label">{tile.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

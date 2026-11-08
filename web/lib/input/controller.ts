/**
 * Input Controller (GAZE_GESTURE_PLAN §4.2–4.3), pure logic, unit-tested.
 * Hit-testing with padding + hysteresis, the dwell state machine, and
 * outcome-event emission. No browser APIs in here: the gaze module feeds
 * points in, React components read ring progress out.
 */

import type { DwellState, GazePoint } from "./types";

const FIXATE_MS = 150; // on a tile this long -> Fixating
const GRACE_MS = 200; // off-tile shorter than this doesn't drain the ring
const COOLDOWN_MS = 800; // after a selection
const HYSTERESIS_MS = 150; // must sit on the NEW tile this long to switch
const PADDING = 0.1; // rect expanded by 10%

export type TileRect = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isPause?: boolean;
};

export type Selection = { tileId: string; label: string; holdMs: number; isPause: boolean };

export class DwellController {
  private rects = new Map<string, TileRect>();
  private phase: DwellState["phase"] = "idle";
  private tileId: string | null = null;
  private fixateStart = 0;
  private offTileSince = 0;
  private cooldownUntil = 0;
  private candidateId: string | null = null;
  private candidateSince = 0;

  constructor(public dwellMs = 1000) {}

  registerTile(rect: TileRect): void {
    this.rects.set(rect.id, rect);
  }

  unregisterTile(id: string): void {
    this.rects.delete(id);
  }

  clearTiles(): void {
    this.rects.clear();
  }

  pause(): void {
    this.phase = "paused";
    this.tileId = null;
  }

  resume(): void {
    if (this.phase === "paused") this.phase = "idle";
  }

  /** Which tile (if any) contains the point, with padding; nearest centre wins. */
  hitTest(point: GazePoint): TileRect | null {
    let best: TileRect | null = null;
    let bestDist = Infinity;
    for (const rect of this.rects.values()) {
      const padX = rect.width * PADDING;
      const padY = rect.height * PADDING;
      if (
        point.x >= rect.x - padX &&
        point.x <= rect.x + rect.width + padX &&
        point.y >= rect.y - padY &&
        point.y <= rect.y + rect.height + padY
      ) {
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        const dist = (point.x - cx) ** 2 + (point.y - cy) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          best = rect;
        }
      }
    }
    return best;
  }

  /**
   * Advance the machine with the latest smoothed point (null = lost).
   * Returns a Selection exactly once per completed dwell.
   */
  tick(point: GazePoint | null, now: number): Selection | null {
    if (this.phase === "paused") return null;

    if (this.phase === "cooldown") {
      if (now >= this.cooldownUntil) this.phase = "idle";
      else return null;
    }

    const hit = point ? this.hitTest(point) : null;

    // Hysteresis: a DIFFERENT tile only takes over after HYSTERESIS_MS on it.
    let effective: TileRect | null = hit;
    if (hit && this.tileId && hit.id !== this.tileId) {
      if (this.candidateId !== hit.id) {
        this.candidateId = hit.id;
        this.candidateSince = now;
      }
      if (now - this.candidateSince < HYSTERESIS_MS) {
        effective = this.rects.get(this.tileId) ?? null;
      }
    } else if (hit) {
      this.candidateId = null;
    }

    if (this.phase === "idle") {
      if (effective) {
        if (this.tileId !== effective.id) {
          this.tileId = effective.id;
          this.fixateStart = now;
        } else if (now - this.fixateStart >= FIXATE_MS) {
          this.phase = "fixating";
        }
      } else {
        this.tileId = null;
      }
      return null;
    }

    // fixating
    if (effective && effective.id === this.tileId) {
      this.offTileSince = 0;
      if (now - this.fixateStart >= this.dwellMs + FIXATE_MS) {
        const rect = this.rects.get(this.tileId)!;
        const holdMs = Math.round(now - this.fixateStart);
        this.phase = "cooldown";
        this.cooldownUntil = now + COOLDOWN_MS;
        this.tileId = null;
        if (rect.isPause) {
          this.pause();
          return { tileId: rect.id, label: rect.label, holdMs, isPause: true };
        }
        return { tileId: rect.id, label: rect.label, holdMs, isPause: false };
      }
      return null;
    }

    // off the tile (or switching): brief look-aways don't reset the ring
    if (this.offTileSince === 0) this.offTileSince = now;
    if (now - this.offTileSince > GRACE_MS) {
      this.phase = "idle";
      this.tileId = effective?.id ?? null;
      this.fixateStart = now;
      this.offTileSince = 0;
    }
    return null;
  }

  state(now: number): DwellState {
    let progress = 0;
    if (this.phase === "fixating" && this.tileId) {
      progress = Math.min(1, Math.max(0, (now - this.fixateStart - FIXATE_MS) / this.dwellMs));
    }
    return { phase: this.phase, tileId: this.tileId, progress };
  }
}

/** Held-gesture detection (GAZE_GESTURE_PLAN §4.4), pure, unit-tested. */
export class GestureDetector {
  private frames: { name: string; score: number; at: number }[] = [];
  private cooldownUntil = 0;

  constructor(
    private windowMs = 500,
    private minScore = 0.7,
    private minFraction = 0.8,
    private cooldownMs = 1000,
  ) {}

  /** Feed one frame's top gesture; returns the gesture name when it fires. */
  push(name: string | null, score: number, now: number): string | null {
    this.frames.push({ name: name ?? "none", score, at: now });
    this.frames = this.frames.filter((f) => now - f.at <= this.windowMs);
    if (now < this.cooldownUntil || !name) return null;

    const window = this.frames;
    if (window.length < 5) return null; // need a real sample of frames
    const matching = window.filter((f) => f.name === name && f.score >= this.minScore);
    if (matching.length / window.length >= this.minFraction) {
      this.cooldownUntil = now + this.cooldownMs;
      this.frames = [];
      return name;
    }
    return null;
  }
}

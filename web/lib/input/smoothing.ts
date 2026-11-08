/**
 * Gaze smoothing (GAZE_GESTURE_PLAN §4.1) — pure logic, unit-tested.
 * Median of the last 10 valid points; drop off-screen points and
 * single-frame jumps larger than 40% of screen width; "lost" after 1s
 * without a valid point.
 */

import type { GazePoint } from "./types";

const WINDOW = 10;
const JUMP_FRACTION = 0.4;
const LOST_AFTER_MS = 1000;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export class GazeSmoother {
  private points: GazePoint[] = [];
  private lastValidAt = 0;
  private hasSample = false;
  private lastRaw: GazePoint | null = null;

  /** Feed a raw sample; null means the face was not found this frame. */
  push(
    raw: GazePoint | null,
    now: number,
    screen: { width: number; height: number },
  ): void {
    if (
      !raw ||
      !Number.isFinite(raw.x) ||
      !Number.isFinite(raw.y) ||
      raw.x < 0 ||
      raw.y < 0 ||
      raw.x > screen.width ||
      raw.y > screen.height
    ) {
      return;
    }
    if (
      this.lastRaw &&
      Math.abs(raw.x - this.lastRaw.x) > screen.width * JUMP_FRACTION
    ) {
      // blink / glitch: remember it so two consistent jumps in a row pass
      this.lastRaw = raw;
      return;
    }
    this.lastRaw = raw;
    this.lastValidAt = now;
    this.hasSample = true;
    this.points.push(raw);
    if (this.points.length > WINDOW) this.points.shift();
  }

  /** Smoothed point, or null when gaze is lost. */
  current(now: number): GazePoint | null {
    if (this.points.length === 0) return null;
    if (now - this.lastValidAt > LOST_AFTER_MS) return null;
    return {
      x: median(this.points.map((p) => p.x)),
      y: median(this.points.map((p) => p.y)),
    };
  }

  lost(now: number): boolean {
    return this.hasSample && now - this.lastValidAt > LOST_AFTER_MS;
  }

  reset(): void {
    this.points = [];
    this.lastRaw = null;
    this.lastValidAt = 0;
    this.hasSample = false;
  }
}

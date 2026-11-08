import type { Landmark } from "./custom-gestures";

export type PointerPoint = { x: number; y: number };

/** Camera coordinates are mirrored exactly once, to match the preview. */
export class HandPointer {
  private point: PointerPoint | null = null;
  push(hand: Landmark[] | null, width: number, height: number): PointerPoint | null {
    const tip = hand?.[8];
    if (!tip || !Number.isFinite(tip.x) || !Number.isFinite(tip.y)) {
      this.point = null;
      return null;
    }
    const next = {
      x: Math.max(0, Math.min(width - 1, (1 - tip.x) * width)),
      y: Math.max(0, Math.min(height - 1, tip.y * height)),
    };
    this.point = this.point ? {
      x: this.point.x + (next.x - this.point.x) * 0.35,
      y: this.point.y + (next.y - this.point.y) * 0.35,
    } : next;
    return this.point;
  }
}

/** A selection cannot repeat until the pointer leaves its target. */
export class HoldSelector {
  private target: string | null = null;
  private since = 0;
  private fired = false;
  constructor(private dwellMs = 1000) {}
  reset() { this.target = null; this.since = 0; this.fired = false; }
  push(target: string | null, now: number) {
    if (target !== this.target) {
      this.target = target; this.since = now; this.fired = false;
    }
    const progress = target ? Math.min(1, (now - this.since) / this.dwellMs) : 0;
    const select = !!target && progress >= 1 && !this.fired;
    if (select) this.fired = true;
    return { target, progress, select };
  }
}

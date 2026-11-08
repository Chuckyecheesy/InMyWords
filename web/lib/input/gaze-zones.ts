/**
 * Webcam gaze is a noisy point. Speak For Me treats it as a vote over
 * large zones, then a slow dwell, so a selection is a stable output
 * rather than a single jittery coordinate.
 */

export const GAZE_DWELL_MS = 2400;
export const GAZE_VOTE_MS = 700;
export const GAZE_VOTE_FRACTION = 0.75;
export const GAZE_SWITCH_MS = 500;
export const GAZE_GRACE_MS = 400;
/** A sample this old still counts; older than this is a look-away. */
export const GAZE_STALE_MS = 500;
export const CONFIRM_LEFT = 0.42;
export const CONFIRM_RIGHT = 0.58;
export const CATEGORY_BAND_PAD = 0.15;
/** How far past a target the look can be and still get pulled in. */
export const BUBBLE_PAD = 0.28;
/** A locked bubble wins until another center is clearly closer, so noise cannot flicker. */
export const BUBBLE_SWITCH_PX = 72;

export type ZoneRect = {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type GazeChoice = {
  target: string | null;
  progress: number;
  select: boolean;
};

/** Nearest category column, with the gaps between cards included. */
export function categoryZone(
  point: { x: number; y: number },
  rects: ZoneRect[],
): string | null {
  const usable = rects.filter((rect) => rect.right > rect.left && rect.bottom > rect.top && rect.id);
  if (!usable.length) return null;
  const top = Math.min(...usable.map((rect) => rect.top));
  const bottom = Math.max(...usable.map((rect) => rect.bottom));
  const pad = (bottom - top) * CATEGORY_BAND_PAD;
  if (point.y < top - pad || point.y > bottom + pad) return null;
  const spanLeft = Math.min(...usable.map((rect) => rect.left));
  const spanRight = Math.max(...usable.map((rect) => rect.right));
  if (point.x < spanLeft || point.x > spanRight) return null;
  let best = usable[0];
  let bestDist = Infinity;
  for (const rect of usable) {
    const center = (rect.left + rect.right) / 2;
    const dist = Math.abs(point.x - center);
    if (dist < bestDist) {
      best = rect;
      bestDist = dist;
    }
  }
  return best.id;
}

/** Left look cancels, right look confirms, and the middle band does neither. */
export function confirmZone(x: number, viewportWidth: number): "gaze:cancel" | "gaze:confirm" | null {
  if (!(viewportWidth > 0) || !Number.isFinite(x)) return null;
  const ratio = x / viewportWidth;
  if (ratio < CONFIRM_LEFT) return "gaze:cancel";
  if (ratio > CONFIRM_RIGHT) return "gaze:confirm";
  return null;
}

export function classifyGazePoint(
  point: { x: number; y: number },
  options: {
    viewportWidth: number;
    confirming: boolean;
    categories: ZoneRect[];
    other: string | null;
  },
): string | null {
  if (options.confirming) return confirmZone(point.x, options.viewportWidth);
  return categoryZone(point, options.categories) ?? options.other;
}

function bubblePad(bubble: ZoneRect): { x: number; y: number } {
  const width = bubble.right - bubble.left;
  const height = bubble.bottom - bubble.top;
  return {
    x: Math.max(48, width * BUBBLE_PAD),
    y: Math.max(48, height * BUBBLE_PAD),
  };
}

function contains(point: { x: number; y: number }, bubble: ZoneRect, pad: { x: number; y: number }): boolean {
  return point.x >= bubble.left - pad.x && point.x <= bubble.right + pad.x
    && point.y >= bubble.top - pad.y && point.y <= bubble.bottom + pad.y;
}

function centerOf(bubble: ZoneRect): { x: number; y: number } {
  return { x: (bubble.left + bubble.right) / 2, y: (bubble.top + bubble.bottom) / 2 };
}

function distanceTo(point: { x: number; y: number }, bubble: ZoneRect): number {
  const center = centerOf(bubble);
  return Math.hypot(point.x - center.x, point.y - center.y);
}

/**
 * Aim assist. A look that gets close to a target is placed on that target's
 * center and stays there until another target is clearly closer.
 */
export class BubbleMagnet {
  private locked: string | null = null;

  clear(): void {
    this.locked = null;
  }

  snap(point: { x: number; y: number }, bubbles: ZoneRect[]): { x: number; y: number; id: string | null } {
    const usable = bubbles.filter((bubble) => bubble.id && bubble.right > bubble.left && bubble.bottom > bubble.top);
    const lock = usable.find((bubble) => bubble.id === this.locked) ?? null;
    let next: ZoneRect | null = null;
    if (lock && contains(point, lock, bubblePad(lock))) {
      next = lock;
      const takeover = usable.find((bubble) => bubble.id !== lock.id
        && contains(point, bubble, { x: 0, y: 0 })
        && distanceTo(point, bubble) + BUBBLE_SWITCH_PX < distanceTo(point, lock));
      if (takeover) next = takeover;
    } else {
      const core = usable.filter((bubble) => contains(point, bubble, { x: 0, y: 0 }));
      const pool = core.length ? core : usable.filter((bubble) => contains(point, bubble, bubblePad(bubble)));
      const sorted = pool.slice().sort((a, b) => distanceTo(point, a) - distanceTo(point, b));
      const leader = sorted[0];
      const runner = sorted[1];
      if (leader && (!runner || core.includes(leader) || distanceTo(point, runner) - distanceTo(point, leader) >= BUBBLE_SWITCH_PX)) {
        next = leader;
      }
    }
    this.locked = next?.id ?? null;
    if (!next) return { x: point.x, y: point.y, id: null };
    return { ...centerOf(next), id: next.id };
  }
}

/** Share of samples in one zone, ignoring nothing: nulls count against the majority. */
export function majorityZone(zones: (string | null)[], fraction = GAZE_VOTE_FRACTION): string | null {
  if (!zones.length) return null;
  const counts = new Map<string, number>();
  for (const zone of zones) {
    if (!zone) continue;
    counts.set(zone, (counts.get(zone) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [zone, count] of counts) {
    if (count > bestCount) {
      best = zone;
      bestCount = count;
    }
  }
  if (!best || bestCount / zones.length < fraction) return null;
  return best;
}

/**
 * Vote, then wait before switching, then dwell. A brief disagreement
 * keeps the current zone and its progress. A selection fires once
 * until the look leaves and returns.
 */
export class GazeLatch {
  private samples: { zone: string | null; at: number }[] = [];
  private pendingOffer: string | null = null;
  private pendingSince = 0;
  private latched: string | null = null;
  private elapsed = 0;
  private accrueFrom = 0;
  private awaySince = 0;
  private fired = false;

  constructor(
    private dwellMs = GAZE_DWELL_MS,
    private voteMs = GAZE_VOTE_MS,
    private voteFraction = GAZE_VOTE_FRACTION,
    private switchMs = GAZE_SWITCH_MS,
    private graceMs = GAZE_GRACE_MS,
  ) {}

  reset(): void {
    this.samples = [];
    this.pendingOffer = null;
    this.pendingSince = 0;
    this.latched = null;
    this.elapsed = 0;
    this.accrueFrom = 0;
    this.awaySince = 0;
    this.fired = false;
  }

  push(zone: string | null, now: number): GazeChoice {
    this.samples.push({ zone, at: now });
    this.samples = this.samples.filter((sample) => sample.at >= now - this.voteMs);
    const offered = majorityZone(this.samples.map((sample) => sample.zone), this.voteFraction);

    if (offered !== this.pendingOffer) {
      this.pendingOffer = offered;
      this.pendingSince = now;
    }
    const switched = offered !== null && now - this.pendingSince >= this.switchMs ? offered : null;
    const same = this.latched !== null && offered === this.latched;

    if (same) {
      if (this.awaySince !== 0) {
        this.accrueFrom = now;
        this.awaySince = 0;
      }
      this.elapsed += now - this.accrueFrom;
      this.accrueFrom = now;
    } else if (this.latched !== null) {
      if (this.awaySince === 0) this.awaySince = now;
      if (now - this.awaySince > this.graceMs) {
        this.latched = null;
        this.elapsed = 0;
        this.fired = false;
        this.awaySince = 0;
      }
    }

    if (this.latched === null && switched) {
      this.latched = switched;
      this.elapsed = 0;
      this.accrueFrom = now;
      this.fired = false;
      this.awaySince = 0;
    }

    const progress = this.latched ? Math.min(1, this.elapsed / this.dwellMs) : 0;
    const select = !!this.latched && this.elapsed >= this.dwellMs && !this.fired;
    if (select) this.fired = true;
    return { target: this.latched, progress, select };
  }
}

/**
 * G8 — teach a personal gesture (GAZE_GESTURE_PLAN §G8). Pure logic,
 * unit-tested. 21 hand landmarks are normalized so position and distance
 * from the camera don't matter: wrist (landmark 0) moves to the origin,
 * everything scales by hand size. Recognition is nearest-match against
 * the taught samples with a distance threshold; a frame where a BUILT-IN
 * gesture scores high is never matched (no false triggers from Thumb_Up
 * and friends — the G8 done-when).
 */

export type Landmark = { x: number; y: number; z?: number };
/** 63 floats: 21 normalized landmarks × (x, y, z). */
export type GestureSample = number[];
export type TaughtGesture = { tile_label: string; samples: GestureSample[] };

const LANDMARK_COUNT = 21;
/** Mean per-point distance below this = same hand shape. */
export const MATCH_THRESHOLD = 0.2;
/** A built-in gesture at or above this score owns the frame. */
const BUILTIN_OWNS_FRAME = 0.7;

export function normalizeLandmarks(landmarks: Landmark[]): GestureSample | null {
  if (landmarks.length !== LANDMARK_COUNT) return null;
  const wrist = landmarks[0];
  const shifted = landmarks.map((p) => ({
    x: p.x - wrist.x,
    y: p.y - wrist.y,
    z: (p.z ?? 0) - (wrist.z ?? 0),
  }));
  // Hand size = largest distance from the wrist (usually the middle fingertip).
  let size = 0;
  for (const p of shifted) {
    size = Math.max(size, Math.hypot(p.x, p.y, p.z));
  }
  if (size < 1e-6) return null;
  const flat: number[] = [];
  for (const p of shifted) {
    flat.push(p.x / size, p.y / size, p.z / size);
  }
  return flat;
}

/** Mean Euclidean distance per landmark between two normalized samples. */
export function sampleDistance(a: GestureSample, b: GestureSample): number {
  let total = 0;
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    const dx = a[i * 3] - b[i * 3];
    const dy = a[i * 3 + 1] - b[i * 3 + 1];
    const dz = a[i * 3 + 2] - b[i * 3 + 2];
    total += Math.hypot(dx, dy, dz);
  }
  return total / LANDMARK_COUNT;
}

export class CustomGestureMatcher {
  constructor(
    private gestures: TaughtGesture[],
    private threshold = MATCH_THRESHOLD,
  ) {}

  hasGestures(): boolean {
    return this.gestures.some((g) => g.samples.length > 0);
  }

  /**
   * Match one frame. Returns the taught tile label, or null when nothing
   * is close enough — or when a built-in gesture owns the frame.
   */
  matchFrame(
    landmarks: Landmark[] | null,
    builtinName: string | null,
    builtinScore: number,
  ): string | null {
    if (!landmarks || !this.hasGestures()) return null;
    if (builtinName && builtinName !== "None" && builtinScore >= BUILTIN_OWNS_FRAME) {
      return null;
    }
    const normalized = normalizeLandmarks(landmarks);
    if (!normalized) return null;
    let bestLabel: string | null = null;
    let bestDistance = Infinity;
    for (const gesture of this.gestures) {
      for (const sample of gesture.samples) {
        const distance = sampleDistance(normalized, sample);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestLabel = gesture.tile_label;
        }
      }
    }
    return bestDistance <= this.threshold ? bestLabel : null;
  }
}

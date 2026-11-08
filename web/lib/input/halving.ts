/** Eye typing by alphabet halving (ROADMAP Phase 6).
 *
 *  Each dwell halves the remaining letters, so any letter takes about
 *  log2(27) ≈ 5 dwells. Pure logic, no DOM: the board component feeds
 *  selections in (gaze dwell or touch — same calls) and letters come out. */

export const ALPHABET = [..."abcdefghijklmnopqrstuvwxyz", " "];

export type Half = "first" | "second";

export function splitLetters(remaining: string[]): [string[], string[]] {
  const middle = Math.ceil(remaining.length / 2);
  return [remaining.slice(0, middle), remaining.slice(middle)];
}

export function narrow(remaining: string[], half: Half): string[] {
  const [first, second] = splitLetters(remaining);
  return half === "first" ? first : second;
}

/** "a to m", "n, o", "z", "space" — spoken-friendly, no ranges of one. */
export function describeLetters(chars: string[]): string {
  const shown = chars.map((ch) => (ch === " " ? "space" : ch));
  if (shown.length === 1) return shown[0];
  if (shown.length === 2) return `${shown[0]} or ${shown[1]}`;
  return `${shown[0]} to ${shown[shown.length - 1]}`;
}

/** Dwells needed from the full alphabet, for the explainer copy. */
export function dwellsPerLetter(): number {
  return Math.ceil(Math.log2(ALPHABET.length));
}

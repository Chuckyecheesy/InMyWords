/**
 * JS mirrors of app/tokens.css — keep pad colours in lockstep with Cloudinary.
 * Prefer CSS vars in the UI; use these only where CSS cannot reach (image URLs).
 */

export const TOKENS = {
  calm: {
    paper: "#E4EFEA",
    ink: "#1A2E28",
    card: "#F7FBFA",
    line: "#C5D6CF",
  },
  contrast: {
    paper: "#FFFFFF",
    ink: "#000000",
    card: "#FFFFFF",
    line: "#000000",
  },
  type: {
    bodyMinPx: 22,
    bodyLargePx: 26,
  },
  tap: {
    minPx: 64,
    largePx: 72,
  },
} as const;

/** Cloudinary pad hex without # — matches --card in each theme. */
export const TILE_PAD = {
  calm: TOKENS.calm.card.slice(1),
  contrast: TOKENS.contrast.card.slice(1),
} as const;

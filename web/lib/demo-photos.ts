/**
 * Demo photos marked "project original" in public/demo/credits.json are
 * simple drawn placeholders (faces, yes/no). Screens prefer a pictogram or
 * illustration over these, and a real photo over both.
 */
const DRAWN = new Set([
  "tiles/marcus_lisa",
  "story/marcus_lisa",
  "tiles/dana_sister",
  "story/marcus_portrait",
  "tiles/marcus_help",
  "tiles/dana_help",
  "tiles/marcus_yes",
  "tiles/dana_yes",
  "tiles/marcus_no",
  "tiles/dana_no",
]);

export function isDrawnPlaceholder(publicId: string | null | undefined): boolean {
  return Boolean(publicId && DRAWN.has(publicId.replace(/^\/+/, "")));
}

/** First photo worth showing large, or null to use the illustration. */
export function coverPhoto(ids: string[]): string | null {
  return ids.find((id) => !isDrawnPlaceholder(id)) ?? null;
}

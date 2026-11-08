import manifest from "./assets.json";

const files = new Set<string>(manifest as string[]);

/** True when an optional asset (footage, VO, music, captions) is in public/. */
export function hasAsset(relativePath: string): boolean {
  return files.has(relativePath);
}

/** Screen recordings were captured as .webm; drop-in .mp4 replacements win. */
export function screenSrc(name: string): string | null {
  if (files.has(`screens/${name}.mp4`)) return `screens/${name}.mp4`;
  if (files.has(`screens/${name}.webm`)) return `screens/${name}.webm`;
  return null;
}

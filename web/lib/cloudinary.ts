import { TILE_PAD } from "./tokens";

/**
 * Tile recipe, chosen in T4.1 and used for every photo tile.
 *
 * Chain, applied left to right:
 * 1. c_fill,g_auto,w_640,h_640 — square crop, automatic subject and face focus
 * 2. e_background_removal — drop the room behind the person or object
 * 3. c_pad,w_720,h_720 — 40px of the same padding on every side
 * 4. r_48 — the same rounded corners
 *
 * High contrast adds e_contrast:50 and e_sharpen:80, and pads on white.
 * Pad colours come from lib/tokens.ts so they match --card.
 * Uses e_background_removal (built-in transformation). First request may
 * 423 until Cloudinary finishes; later hits are cached. Older clouds may
 * still need Add-ons → Cloudinary AI Remove the Background installed.
 */

export const TILE_RECIPE = {
  calm: `c_fill,g_auto,w_640,h_640/e_background_removal/c_pad,w_720,h_720,b_rgb:${TILE_PAD.calm}/r_48`,
  contrast: `c_fill,g_auto,w_640,h_640/e_background_removal/e_contrast:50,e_sharpen:80/c_pad,w_720,h_720,b_rgb:${TILE_PAD.contrast}/r_48`,
} as const;

/**
 * Fields the browser may send to Cloudinary's unsigned upload.
 * The API secret and API key are accepted here so a caller cannot
 * accidentally spread a credentials object into the request.
 */
export function unsignedUploadFields(input: {
  cloudName: string;
  uploadPreset: string;
  apiSecret?: string;
  apiKey?: string;
}): { cloud_name: string; upload_preset: string } {
  const cloud_name = input.cloudName.trim();
  const upload_preset = input.uploadPreset.trim();
  if (!cloud_name || !upload_preset) {
    throw new Error("Unsigned upload needs a cloud name and an upload preset.");
  }
  return { cloud_name, upload_preset };
}

/** Wide chapter photo for story pages. Same cloud as tiles, from config. */
export function storyImageUrl(publicId: string): string | null {
  const cloud =
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
    process.env.CLOUDINARY_CLOUD_NAME;
  const id = publicId.replace(/^\/+/, "");
  if (!cloud || !id) return null;
  return `https://res.cloudinary.com/${cloud}/image/upload/c_fill,g_auto,w_800,h_400/${id}.jpg`;
}

export function tileImageUrl(
  publicId: string,
  mode: "calm" | "contrast",
): string | null {
  const cloud =
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
    process.env.CLOUDINARY_CLOUD_NAME;
  const id = publicId.replace(/^\/+/, "");
  if (!cloud || !id) return null;
  return `https://res.cloudinary.com/${cloud}/image/upload/${TILE_RECIPE[mode]}/${id}`;
}

import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";

const poppins = loadPoppins("normal", { weights: ["400", "500", "800"] });

export const FONT = poppins.fontFamily;

export const COLORS = {
  teal: "#1F6F78",
  coral: "#F28C6B",
  ink: "#1B2B34",
  offWhite: "#F4F8F8",
  white: "#FFFFFF",
  green: "#2E8B57",
};

/** YouTube title-safe margins (px at 1080p). */
export const SAFE = { x: 96, y: 54, captionBand: 140 };

export const FPS = 30;

import React, { useEffect, useState } from "react";
import {
  Audio,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { parseSrt, Caption } from "@remotion/captions";
import { COLORS, FONT, SAFE } from "../theme";
import { hasAsset } from "../assets";

/** Absolute frame windows where Marcus's own voice plays: music goes to 0. */
export const DUCK_WINDOWS: Array<[number, number]> = [
  [2660, 2850], // simulated Speak For Me approval
  [5360, 5720], // My Story narration
  [7100, 7210], // closing callback
];

/** Music: 100% in the cold open, cut at the freeze, 30% under VO, 0 under Marcus. */
export const MusicBed: React.FC = () => {
  const frame = useCurrentFrame();
  if (!hasAsset("audio/music.mp3")) return null;

  let volume = interpolate(frame, [0, 380, 392, 448, 460, 7380, 7490], [1, 1, 0, 0, 0.3, 0.3, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  for (const [start, end] of DUCK_WINDOWS) {
    const duck = interpolate(frame, [start - 10, start, end, end + 10], [1, 0, 0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    volume *= duck;
  }
  return <Audio loop src={staticFile("audio/music.mp3")} volume={volume} />;
};

/** Burned-in captions from captions.srt, bottom band, never over key UI. */
export const CaptionOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const [handle] = useState(() => (hasAsset("captions.srt") ? delayRender("captions") : null));

  useEffect(() => {
    if (handle === null) return;
    fetch(staticFile("captions.srt"))
      .then((response) => response.text())
      .then((input) => {
        setCaptions(parseSrt({ input }).captions);
        continueRender(handle);
      })
      .catch((error) => cancelRender(error));
  }, [handle]);

  if (!captions) return null;
  const msNow = (frame / 30) * 1000;
  const active = captions.find((c) => msNow >= c.startMs && msNow <= c.endMs);
  if (!active) return null;
  return (
    <div
      style={{
        position: "absolute",
        bottom: (SAFE.captionBand - 80) / 2 + 20,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontFamily: FONT,
          fontSize: 40,
          fontWeight: 500,
          color: COLORS.white,
          background: `${COLORS.ink}B3`,
          borderRadius: 999,
          padding: "10px 36px",
          maxWidth: 1500,
          textAlign: "center",
        }}
      >
        {active.text}
      </div>
    </div>
  );
};

import React from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT, SAFE } from "../theme";
import { hasAsset } from "../assets";

/** Dashed drop-in slot for footage the team films later. Timing is kept. */
export const Placeholder: React.FC<{ label: string; note?: string }> = ({ label, note }) => (
  <AbsoluteFill
    style={{
      background: `linear-gradient(135deg, ${COLORS.ink}, #11202a)`,
      alignItems: "center",
      justifyContent: "center",
      fontFamily: FONT,
    }}
  >
    <div
      style={{
        border: `4px dashed ${COLORS.coral}`,
        borderRadius: 24,
        padding: "56px 88px",
        textAlign: "center",
        color: COLORS.offWhite,
        maxWidth: 1200,
      }}
    >
      <div style={{ fontSize: 40, fontWeight: 500, color: COLORS.coral, marginBottom: 18 }}>
        DROP IN FOOTAGE
      </div>
      <div style={{ fontSize: 56, fontWeight: 800 }}>{label}</div>
      {note ? <div style={{ fontSize: 34, fontWeight: 400, marginTop: 20, opacity: 0.8 }}>{note}</div> : null}
    </div>
  </AbsoluteFill>
);

/** Footage if the file exists, otherwise a placeholder that holds the slot. */
export const MaybeFootage: React.FC<{
  src: string;
  label: string;
  note?: string;
  playbackRate?: number;
  muted?: boolean;
}> = ({ src, label, note, playbackRate, muted }) =>
  hasAsset(src) ? (
    <OffthreadVideo
      src={staticFile(src)}
      playbackRate={playbackRate}
      muted={muted}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  ) : (
    <Placeholder label={src} note={note ?? label} />
  );

/** Scene voiceover: plays audio/vo-<id>.mp3 when the file is present. */
export const SceneVO: React.FC<{ id: string }> = ({ id }) => {
  const src = `audio/vo-${id}.mp3`;
  return hasAsset(src) ? <Audio src={staticFile(src)} /> : null;
};

/** Big feature headline, top-left inside the safe area. */
export const Headline: React.FC<{ text: string; appearAt?: number }> = ({ text, appearAt = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - appearAt, fps, config: { damping: 200 } });
  return (
    <div
      style={{
        position: "absolute",
        top: SAFE.y + 10,
        left: SAFE.x,
        fontFamily: FONT,
        fontSize: 72,
        fontWeight: 800,
        color: COLORS.offWhite,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 24}px)`,
        textShadow: "0 4px 24px rgba(0,0,0,0.5)",
        maxWidth: 1500,
        lineHeight: 1.1,
      }}
    >
      {text}
    </div>
  );
};

/** A screen recording large on the ink background with a slow push-in. */
export const ScreenClip: React.FC<{
  src: string | null;
  headline: string;
  missingLabel: string;
  zoomTo?: number;
}> = ({ src, headline, missingLabel, zoomTo = 1.08 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [1, zoomTo], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ background: COLORS.ink }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: 210 }}>
        <div
          style={{
            width: 1310,
            height: 736,
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 30px 90px rgba(0,0,0,0.55)",
            transform: `scale(${scale})`,
            background: "#000",
          }}
        >
          {src ? (
            <OffthreadVideo src={staticFile(src)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <Placeholder label={missingLabel} />
          )}
        </div>
      </AbsoluteFill>
      <Headline text={headline} />
    </AbsoluteFill>
  );
};

/** White-on-ink pill with a coral border (actor labels, badges). */
export const Pill: React.FC<{
  text: string;
  x: number;
  y: number;
  appearAt?: number;
  fontSize?: number;
}> = ({ text, x, y, appearAt = 0, fontSize = 56 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - appearAt, fps, config: { damping: 12 } });
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `scale(${pop})`,
        fontFamily: FONT,
        fontSize,
        fontWeight: 800,
        color: COLORS.white,
        background: `${COLORS.ink}E6`,
        border: `4px solid ${COLORS.coral}`,
        borderRadius: 999,
        padding: "14px 40px",
      }}
    >
      {text}
    </div>
  );
};

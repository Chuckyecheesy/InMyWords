import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT, SAFE } from "../theme";
import { MaybeFootage, SceneVO } from "../components/common";
import { hasAsset } from "../assets";

const PARTS = [
  { name: "Next.js tablet app", x: 240, y: 300 },
  { name: "FastAPI", x: 760, y: 300 },
  { name: "4 MCP servers", x: 1240, y: 300 },
  { name: "Tiger Data", x: 1240, y: 560 },
  { name: "Gemini", x: 760, y: 560 },
  { name: "ElevenLabs", x: 240, y: 560 },
];

const SPONSORS = ["Gemini", "ElevenLabs", "Cloudinary", "Tiger Data", "Vultr", "MCP"];

/** Scene 13 (10s): architecture, parts glow in sequence, sponsor row. */
export const Architecture: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const highlighted = Math.floor(frame / fps); // one component per second
  const sponsorsIn = interpolate(frame, [7 * fps, 8 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ background: COLORS.offWhite, fontFamily: FONT }}>
      <div style={{ position: "absolute", top: SAFE.y + 10, left: SAFE.x, fontSize: 72, fontWeight: 800, color: COLORS.ink }}>
        Plain code where it matters. AI only phrases.
      </div>
      {hasAsset("architecture.png") ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <Img src={staticFile("architecture.png")} style={{ maxWidth: 1500, maxHeight: 700 }} />
        </AbsoluteFill>
      ) : (
        <>
          {PARTS.map((part, index) => {
            const active = highlighted === index;
            return (
              <div
                key={part.name}
                style={{
                  position: "absolute",
                  left: part.x,
                  top: part.y,
                  width: 420,
                  height: 170,
                  borderRadius: 20,
                  background: COLORS.white,
                  border: `5px solid ${active ? COLORS.coral : COLORS.teal}`,
                  boxShadow: active ? `0 0 60px ${COLORS.teal}99` : "0 10px 30px rgba(27,43,52,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 42,
                  fontWeight: 800,
                  color: COLORS.ink,
                  transform: `scale(${active ? 1.06 : 1})`,
                }}
              >
                {part.name}
              </div>
            );
          })}
          <svg style={{ position: "absolute", inset: 0 }} width={1920} height={1080}>
            <line x1={660} y1={385} x2={760} y2={385} stroke={COLORS.teal} strokeWidth={6} />
            <line x1={1180} y1={385} x2={1240} y2={385} stroke={COLORS.teal} strokeWidth={6} />
            <line x1={1450} y1={470} x2={1450} y2={560} stroke={COLORS.teal} strokeWidth={6} />
            <line x1={970} y1={470} x2={970} y2={560} stroke={COLORS.teal} strokeWidth={6} />
            <line x1={450} y1={470} x2={450} y2={560} stroke={COLORS.teal} strokeWidth={6} />
          </svg>
        </>
      )}
      <div
        style={{
          position: "absolute",
          bottom: SAFE.captionBand + 30,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 34,
          opacity: sponsorsIn,
        }}
      >
        {SPONSORS.map((sponsor) => (
          <div
            key={sponsor}
            style={{
              fontSize: 40,
              fontWeight: 500,
              color: COLORS.ink,
              background: COLORS.white,
              borderRadius: 999,
              padding: "12px 34px",
              border: `3px solid ${COLORS.teal}`,
            }}
          >
            {sponsor}
          </div>
        ))}
      </div>
      <SceneVO id="architecture" />
    </AbsoluteFill>
  );
};

/** Scene 14 (15s): closing callback, then the end card.
 *  Last 20s rule: logo/team on the LEFT, right third clear for end screens. */
export const Closing: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const CARD_AT = 7 * fps;
  const fadeToInk = interpolate(frame, [CARD_AT - 20, CARD_AT], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [durationInFrames - 30, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const logoIn = spring({ frame: frame - CARD_AT, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ background: COLORS.ink, fontFamily: FONT }}>
      <Sequence durationInFrames={CARD_AT}>
        <MaybeFootage
          src="footage/closing.mp4"
          label="Closing callback: tablet speaks, staff answers"
          note="Resident taps, app says the bowling line, staff: Bowling! Let's go."
          muted
        />
        {hasAsset("audio/marcus-bowling.mp3") ? (
          <Sequence from={2 * fps}>
            <Audio src={staticFile("audio/marcus-bowling.mp3")} />
          </Sequence>
        ) : null}
      </Sequence>
      <AbsoluteFill style={{ background: COLORS.ink, opacity: fadeToInk }} />
      {frame >= CARD_AT ? (
        <div style={{ position: "absolute", left: SAFE.x + 40, top: 280, width: 900, opacity: logoIn }}>
          <Img src={staticFile("in-my-words-logo-dark.svg")} style={{ width: 620 }} />
          <div style={{ fontSize: 48, fontWeight: 500, color: COLORS.offWhite, marginTop: 36 }}>
            Your story, told once, in your own voice.
          </div>
          <div style={{ fontSize: 36, fontWeight: 400, color: COLORS.offWhite, opacity: 0.85, marginTop: 70, lineHeight: 1.6 }}>
            Tiffany · James · Ahmed · William
            <br />
            Built for KW Habilitation at CommuniHacks 2026
          </div>
        </div>
      ) : null}
      <AbsoluteFill style={{ background: "#000", opacity: fadeOut }} />
      <SceneVO id="closing" />
    </AbsoluteFill>
  );
};

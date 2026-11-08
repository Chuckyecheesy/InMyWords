import React from "react";
import {
  AbsoluteFill,
  Freeze,
  Img,
  Sequence,
  interpolate,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT, SAFE } from "../theme";
import { MaybeFootage, Pill, Placeholder, SceneVO } from "../components/common";

/** Scene 1 (0:00-0:15): Charades Gone Wrong. Freeze + slam at 0:13. */
export const ColdOpen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const FREEZE_AT = 13 * fps;
  const slam = spring({ frame: frame - FREEZE_AT, fps, config: { damping: 14 } });
  const footage = (
    <MaybeFootage
      src="footage/cold-open.mp4"
      label="Charades scene: two actors, everyday items"
      playbackRate={2}
      muted
    />
  );
  return (
    <AbsoluteFill style={{ background: COLORS.ink }}>
      {frame < FREEZE_AT ? (
        <AbsoluteFill>{footage}</AbsoluteFill>
      ) : (
        <Freeze frame={FREEZE_AT - 1}>
          <AbsoluteFill>{footage}</AbsoluteFill>
        </Freeze>
      )}
      <Pill text="Resident" x={SAFE.x + 60} y={SAFE.y + 120} appearAt={10} />
      <Pill text="Staff" x={1920 - SAFE.x - 320} y={SAFE.y + 120} appearAt={18} />
      {frame >= FREEZE_AT ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              transform: `scale(${1.5 - 0.5 * slam})`,
              opacity: slam,
              background: "linear-gradient(180deg, rgba(27,43,52,0.0), rgba(27,43,52,0.92), rgba(27,43,52,0.0))",
              padding: "60px 90px",
              textAlign: "center",
              fontFamily: FONT,
              fontSize: 72,
              fontWeight: 800,
              maxWidth: 1600,
            }}
          >
            <span style={{ color: COLORS.coral }}>What they meant: </span>
            <span style={{ color: COLORS.white }}>&ldquo;Can we go bowling Saturday?&rdquo;</span>
          </div>
        </AbsoluteFill>
      ) : null}
      <SceneVO id="cold-open" />
    </AbsoluteFill>
  );
};

/** Scene 2 (0:15-0:45): presenter states the problem; lower-third phrases. */
export const Presenter: React.FC = () => {
  const { fps } = useVideoConfig();
  const phrases = ["Hard to be understood", "Hard to understand", "Story told by someone else"];
  return (
    <AbsoluteFill style={{ background: COLORS.ink }}>
      <MaybeFootage src="footage/presenter.mp4" label="Presenter on camera" />
      {phrases.map((phrase, index) => (
        <Sequence key={phrase} from={(5 + index * 8) * fps} durationInFrames={8 * fps}>
          <LowerThird text={phrase} />
        </Sequence>
      ))}
      <SceneVO id="presenter" />
    </AbsoluteFill>
  );
};

const LowerThird: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const opacity = interpolate(frame, [0, 12, durationInFrames - 12, durationInFrames], [0, 1, 1, 0]);
  return (
    <div
      style={{
        position: "absolute",
        left: SAFE.x,
        bottom: SAFE.captionBand + 40,
        background: COLORS.teal,
        color: COLORS.white,
        fontFamily: FONT,
        fontSize: 48,
        fontWeight: 500,
        padding: "16px 44px",
        borderRadius: 10,
        opacity,
      }}
    >
      {text}
    </div>
  );
};

/** Scene 3 (0:45-1:00): logo, tile particle burst, tagline, Marcus's card. */
export const LogoIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const icon = spring({ frame, fps, config: { damping: 16 } });
  const tagline = spring({ frame: frame - 34, fps, config: { damping: 200 } });
  const card = spring({ frame: frame - 52, fps, config: { damping: 15 } });
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 42% 40%, #dff0ee 0%, ${COLORS.offWhite} 60%)`,
        fontFamily: FONT,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {Array.from({ length: 20 }).map((_, i) => {
        const angle = random(`angle-${i}`) * Math.PI * 2;
        const distance = interpolate(frame, [4, 46], [0, 320 + random(`dist-${i}`) * 420], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const fade = interpolate(frame, [20, 48], [0.9, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 700 + Math.cos(angle) * distance,
              top: 470 + Math.sin(angle) * distance,
              width: 26 + random(`size-${i}`) * 22,
              height: 26 + random(`size-${i}`) * 22,
              borderRadius: 8,
              background: i % 3 === 0 ? COLORS.coral : COLORS.teal,
              opacity: fade,
            }}
          />
        );
      })}
      <div style={{ position: "absolute", left: 140, top: 0, bottom: 0, width: 1160, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <Img
          src={staticFile("in-my-words-logo.svg")}
          style={{ width: 760, transform: `scale(${3 - 2 * icon})`, transformOrigin: "center", opacity: Math.min(1, icon * 2) }}
        />
        <div
          style={{
            fontSize: 48,
            fontWeight: 500,
            color: COLORS.ink,
            marginTop: 54,
            opacity: tagline,
            transform: `translateY(${(1 - tagline) * 30}px)`,
            textAlign: "center",
          }}
        >
          Your story, told once, in your own voice.
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: SAFE.x,
          top: 340,
          width: 360,
          background: COLORS.white,
          borderRadius: 20,
          boxShadow: "0 20px 60px rgba(27,43,52,0.25)",
          padding: 28,
          transform: `translateX(${(1 - card) * 480}px)`,
        }}
      >
        <Img
          src={staticFile("demo/marcus_portrait.jpg")}
          style={{ width: "100%", height: 230, objectFit: "cover", borderRadius: 12 }}
        />
        <div style={{ fontSize: 44, fontWeight: 800, color: COLORS.ink, marginTop: 18 }}>Marcus</div>
        <div style={{ fontSize: 30, fontWeight: 400, color: COLORS.ink, opacity: 0.75, marginTop: 6 }}>
          Communicates with picture cards and short phrases
        </div>
      </div>
      <SceneVO id="logo" />
    </AbsoluteFill>
  );
};

export const MissingNote = Placeholder;

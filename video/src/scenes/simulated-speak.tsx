import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT, SAFE } from "../theme";
import { Cursor, CursorStop } from "../components/Cursor";
import { SceneVO } from "../components/common";
import { hasAsset } from "../assets";

/** Scene 5 core (21s, 630 frames): a crisp React-built Speak For Me.
 *  Beats (frames): tap coffee 70, tap now 130, tap Help 200, spinner to 215,
 *  suggestions 215-290, tap first card 330, check + Marcus speaks 360+. */

const TILES = [
  { label: "coffee", photo: "demo/marcus_coffee.jpg" },
  { label: "tea", photo: "demo/marcus_tea.jpg" },
  { label: "bowling", photo: "demo/marcus_bowling.jpg" },
  { label: "Raptors", photo: "demo/marcus_raptors.jpg" },
  { label: "Lisa", photo: "demo/marcus_lisa.jpg" },
  { label: "now", photo: "demo/marcus_later.jpg" },
];

const GRID = { left: 180, top: 310, tile: 250, gap: 30, cardH: 224, photoH: 168 };
const tileAt = (index: number) => ({
  x: GRID.left + (index % 3) * (GRID.tile + GRID.gap),
  y: GRID.top + Math.floor(index / 3) * (GRID.cardH + GRID.gap),
});

const SUGGESTIONS = [
  "Can I get a double-double from Tim's?",
  "I want a coffee now.",
  "Coffee please.",
];

const STOPS: CursorStop[] = [
  { frame: 20, x: 940, y: 760 },
  { frame: 70, x: tileAt(0).x + 125, y: tileAt(0).y + 110, click: true },
  { frame: 130, x: tileAt(5).x + 125, y: tileAt(5).y + 110, click: true },
  { frame: 200, x: 585, y: 850, click: true },
  { frame: 330, x: 1490, y: 390, click: true },
];

export const SimulatedSpeak: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const picked: string[] = [];
  if (frame >= 70) picked.push("coffee");
  if (frame >= 130) picked.push("now");

  const buttonPressed = frame >= 200 && frame < 208;
  const thinking = frame >= 200 && frame < 215;
  const showSuggestions = frame >= 215;
  const approved = frame >= 360;

  return (
    <AbsoluteFill style={{ background: COLORS.ink, fontFamily: FONT }}>
      {/* Sentence strip */}
      <div
        style={{
          position: "absolute",
          top: 184,
          left: GRID.left,
          width: 930,
          minHeight: 92,
          background: "#243b47",
          borderRadius: 18,
          display: "flex",
          alignItems: "center",
          gap: 20,
          padding: "0 32px",
          color: COLORS.offWhite,
          fontSize: 40,
          fontWeight: 500,
        }}
      >
        {picked.length === 0 ? (
          <span style={{ opacity: 0.5 }}>Tap pictures to say something…</span>
        ) : (
          picked.map((word) => <StripChip key={word} word={word} />)
        )}
      </div>

      {/* Tile grid */}
      {TILES.map((tile, index) => {
        const { x, y } = tileAt(index);
        const isPicked = picked.includes(tile.label);
        return (
          <div
            key={tile.label}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: GRID.tile,
              borderRadius: 20,
              overflow: "hidden",
              background: COLORS.white,
              outline: isPicked ? `6px solid ${COLORS.coral}` : "6px solid transparent",
              boxShadow: "0 14px 40px rgba(0,0,0,0.4)",
            }}
          >
            <Img src={staticFile(tile.photo)} style={{ width: "100%", height: GRID.photoH, objectFit: "cover" }} />
            <div style={{ fontSize: 30, fontWeight: 500, color: COLORS.ink, textAlign: "center", padding: "8px 0" }}>
              {tile.label}
            </div>
          </div>
        );
      })}

      {/* Help me say it */}
      <div
        style={{
          position: "absolute",
          left: GRID.left,
          top: 812,
          width: 3 * GRID.tile + 2 * GRID.gap,
          height: 76,
          borderRadius: 16,
          background: COLORS.teal,
          color: COLORS.white,
          fontSize: 42,
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          transform: `scale(${buttonPressed ? 0.95 : 1})`,
        }}
      >
        {thinking ? <Spinner /> : null}
        Help me say it
      </div>

      {/* Suggestions column */}
      <div style={{ position: "absolute", left: 1180, top: 310, width: 640 }}>
        {showSuggestions
          ? SUGGESTIONS.map((text, index) => {
              const enter = spring({ frame: frame - (215 + index * 12), fps, config: { damping: 14 } });
              const isChosen = index === 0 && frame >= 330;
              return (
                <div
                  key={text}
                  style={{
                    background: isChosen ? "#e9f6ef" : COLORS.offWhite,
                    borderRadius: 16,
                    padding: "22px 28px",
                    marginBottom: 20,
                    fontSize: 36,
                    fontWeight: 500,
                    color: COLORS.ink,
                    opacity: enter,
                    transform: `translateY(${(1 - enter) * 40}px)`,
                    outline: isChosen ? `6px solid ${COLORS.green}` : undefined,
                    display: "flex",
                    alignItems: "center",
                    gap: 18,
                  }}
                >
                  {isChosen ? <BigCheck at={335} /> : null}
                  {text}
                </div>
              );
            })
          : null}
        {approved ? <Speaking /> : null}
      </div>

      {/* The rule, spelled out */}
      {frame >= 390 ? (
        <div
          style={{
            position: "absolute",
            left: 1180,
            top: 880,
            width: 630,
            fontSize: 40,
            fontWeight: 800,
            color: COLORS.coral,
            opacity: interpolate(frame, [390, 410], [0, 1], { extrapolateRight: "clamp" }),
          }}
        >
          Nothing is spoken without his approval.
        </div>
      ) : null}

      <div
        style={{
          position: "absolute",
          top: SAFE.y + 10,
          left: GRID.left,
          fontSize: 72,
          fontWeight: 800,
          color: COLORS.offWhite,
        }}
      >
        His words. His voice.
      </div>

      <Cursor stops={STOPS} />
      {hasAsset("audio/marcus-coffee.mp3") && frame >= 360 ? (
        <Audio src={staticFile("audio/marcus-coffee.mp3")} />
      ) : null}
      <SceneVO id="speak" />
    </AbsoluteFill>
  );
};

const StripChip: React.FC<{ word: string }> = ({ word }) => (
  <span style={{ background: COLORS.teal, borderRadius: 12, padding: "6px 24px" }}>{word}</span>
);

const Spinner: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        border: `6px solid ${COLORS.white}55`,
        borderTopColor: COLORS.white,
        transform: `rotate(${frame * 24}deg)`,
      }}
    />
  );
};

const BigCheck: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - at, fps, config: { damping: 10 } });
  return (
    <div
      style={{
        minWidth: 56,
        height: 56,
        borderRadius: 999,
        background: COLORS.green,
        color: COLORS.white,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 38,
        fontWeight: 800,
        transform: `scale(${pop})`,
      }}
    >
      ✓
    </div>
  );
};

const Speaking: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 10, color: COLORS.coral }}>
      <div style={{ fontSize: 56, transform: `scale(${1 + 0.12 * Math.sin(frame / 3)})` }}>🔊</div>
      <div style={{ fontFamily: FONT, fontSize: 38, fontWeight: 500, color: COLORS.offWhite }}>
        Speaking in Marcus&apos;s own voice…
      </div>
    </div>
  );
};

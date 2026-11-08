import React from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONT, SAFE } from "../theme";
import { Headline, Placeholder, SceneVO, ScreenClip } from "../components/common";
import { hasAsset, screenSrc } from "../assets";

/** One screen-recording beat with a per-scene VO track. */
export const Beat: React.FC<{ screen: string; headline: string; vo?: string }> = ({
  screen,
  headline,
  vo,
}) => (
  <>
    <ScreenClip src={screenSrc(screen)} headline={headline} missingLabel={`screens/${screen}`} />
    {vo ? <SceneVO id={vo} /> : null}
  </>
);

/** Scene 8 (30s): callback line, choice, planner, staff planner. */
export const ChoiceAndPlanner: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: COLORS.ink }}>
      <Sequence durationInFrames={2 * fps}>
        <Callback />
      </Sequence>
      <Sequence from={2 * fps} durationInFrames={9 * fps}>
        <ScreenClip src={screenSrc("choice")} headline="His choice. His budget, in plain math." missingLabel="screens/choice" />
        <ChoseBadge appearAt={6 * fps} />
      </Sequence>
      <Sequence from={11 * fps} durationInFrames={10 * fps}>
        <ScreenClip src={screenSrc("planner")} headline="Straight into his calendar." missingLabel="screens/planner" />
      </Sequence>
      <Sequence from={21 * fps} durationInFrames={9 * fps}>
        <ScreenClip
          src={screenSrc("staff-planner")}
          headline="Anything that needs a person becomes a staff task."
          missingLabel="screens/staff-planner"
        />
      </Sequence>
      <SceneVO id="choice" />
    </AbsoluteFill>
  );
};

const Callback: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 15 } });
  return (
    <AbsoluteFill style={{ background: COLORS.ink, alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          fontFamily: FONT,
          fontSize: 64,
          fontWeight: 800,
          color: COLORS.coral,
          transform: `scale(${pop})`,
          textAlign: "center",
          maxWidth: 1400,
        }}
      >
        Remember what they were trying to say?
      </div>
    </AbsoluteFill>
  );
};

const ChoseBadge: React.FC<{ appearAt: number }> = ({ appearAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - appearAt, fps, config: { damping: 11 } });
  if (frame < appearAt) return null;
  return (
    <div
      style={{
        position: "absolute",
        right: SAFE.x + 40,
        top: SAFE.y + 40,
        transform: `scale(${pop}) rotate(-4deg)`,
        fontFamily: FONT,
        fontSize: 52,
        fontWeight: 800,
        color: COLORS.white,
        background: COLORS.green,
        borderRadius: 16,
        padding: "16px 42px",
        boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
      }}
    >
      Marcus chose ✓
    </div>
  );
};

/** Scene 9 (13s): Get staff help, both sides at once. */
export const StaffHelp: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const arrow = spring({ frame: frame - 3 * fps, fps, config: { damping: 200 } });
  const resident = screenSrc("staff-help-resident");
  const staff = screenSrc("staff-help-staff");
  const panel = (src: string | null, missing: string): React.ReactNode =>
    src ? (
      <OffthreadVideo src={staticFile(src)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    ) : (
      <Placeholder label={missing} />
    );
  return (
    <AbsoluteFill style={{ background: COLORS.ink }}>
      <div
        style={{
          position: "absolute",
          top: 250,
          left: SAFE.x,
          right: SAFE.x,
          bottom: SAFE.captionBand + 20,
          display: "flex",
          gap: 60,
        }}
      >
        {[
          { src: resident, missing: "screens/staff-help-resident", label: "Marcus's tablet" },
          { src: staff, missing: "screens/staff-help-staff", label: "Every staff screen" },
        ].map((side) => (
          <div key={side.label} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontFamily: FONT, fontSize: 40, fontWeight: 500, color: COLORS.offWhite }}>
              {side.label}
            </div>
            <div style={{ flex: 1, borderRadius: 16, overflow: "hidden", boxShadow: "0 24px 70px rgba(0,0,0,0.5)" }}>
              {panel(side.src, side.missing)}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 600,
          transform: `translateX(-50%) scaleX(${arrow})`,
          fontSize: 110,
          color: COLORS.coral,
        }}
      >
        ➜
      </div>
      <Headline text="One tap. Every staff member knows." />
      <SceneVO id="help" />
    </AbsoluteFill>
  );
};

/** Scene 10 (14s): My Story with Marcus's narration. */
export const Story: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: COLORS.ink }}>
      <ScreenClip src={screenSrc("story")} headline="Told once. Heard by everyone." missingLabel="screens/story" />
      {hasAsset("audio/marcus-story.mp3") && frame >= 30 ? (
        <Audio src={staticFile("audio/marcus-story.mp3")} />
      ) : null}
      <SceneVO id="story" />
    </AbsoluteFill>
  );
};

/** Scene 11 part: Coach with source badges springing in when sources open. */
export const Coach: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const zoom = interpolate(frame, [4 * fps, durationInFrames], [1, 1.12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const badges = ["In Marcus's words", "Staff note", "Record"];
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
            transform: `scale(${zoom})`,
            background: "#000",
          }}
        >
          {screenSrc("coach") ? (
            <OffthreadVideo src={staticFile(screenSrc("coach")!)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <Placeholder label="screens/coach" />
          )}
        </div>
      </AbsoluteFill>
      <div style={{ position: "absolute", right: SAFE.x, top: 260, display: "flex", flexDirection: "column", gap: 22 }}>
        {badges.map((badge, index) => {
          const pop = spring({ frame: frame - (5 * fps + index * 10), fps, config: { damping: 12 } });
          return (
            <div
              key={badge}
              style={{
                fontFamily: FONT,
                fontSize: 40,
                fontWeight: 800,
                color: COLORS.ink,
                background: index === 0 ? COLORS.coral : COLORS.offWhite,
                borderRadius: 999,
                padding: "14px 36px",
                transform: `scale(${pop})`,
                boxShadow: "0 12px 36px rgba(0,0,0,0.4)",
              }}
            >
              {badge}
            </div>
          );
        })}
      </div>
      <Headline text="Every answer has a source." />
      <SceneVO id="staff" />
    </AbsoluteFill>
  );
};

/** Scene 12 (10s): memory confirm, dashed -> solid label morph. */
export const Memory: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const MORPH_AT = 5.5 * fps;
  const morph = spring({ frame: frame - MORPH_AT, fps, config: { damping: 14 } });
  const dashed = frame < MORPH_AT;
  return (
    <AbsoluteFill style={{ background: COLORS.ink }}>
      <ScreenClip src={screenSrc("memory")} headline="Only Marcus can confirm." missingLabel="screens/memory" />
      <div
        style={{
          position: "absolute",
          right: SAFE.x,
          top: 280,
          fontFamily: FONT,
          fontSize: 42,
          fontWeight: 800,
          color: dashed ? COLORS.offWhite : COLORS.ink,
          background: dashed ? "transparent" : COLORS.coral,
          border: dashed ? `4px dashed ${COLORS.offWhite}` : "4px solid transparent",
          borderRadius: 999,
          padding: "16px 40px",
          transform: dashed ? undefined : `scale(${0.9 + 0.1 * morph})`,
        }}
      >
        {dashed ? "pattern noticed" : "In Marcus's words"}
      </div>
      <SceneVO id="memory" />
    </AbsoluteFill>
  );
};

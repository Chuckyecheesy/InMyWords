import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS } from "../theme";

export type CursorStop = { frame: number; x: number; y: number; click?: boolean };

function positionAt(frame: number, stops: CursorStop[]): { x: number; y: number } {
  const frames = stops.map((s) => s.frame);
  const x = interpolate(frame, frames, stops.map((s) => s.x), {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3), // smooth ease-out between stops
  });
  const y = interpolate(frame, frames, stops.map((s) => s.y), {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  return { x, y };
}

/** White cursor dot with a trailing shadow; never teleports (interpolated path). */
export const Cursor: React.FC<{ stops: CursorStop[] }> = ({ stops }) => {
  const frame = useCurrentFrame();
  const now = positionAt(frame, stops);
  const trail = positionAt(Math.max(0, frame - 3), stops);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: trail.x - 8,
          top: trail.y - 8,
          width: 16,
          height: 16,
          borderRadius: 999,
          background: COLORS.white,
          opacity: 0.35,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: now.x - 8,
          top: now.y - 8,
          width: 16,
          height: 16,
          borderRadius: 999,
          background: COLORS.white,
          opacity: 0.95,
          boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
        }}
      />
      {stops
        .filter((s) => s.click)
        .map((s) => (
          <Ripple key={s.frame} at={s.frame} x={s.x} y={s.y} />
        ))}
    </>
  );
};

/** Coral tap ripple. */
export const Ripple: React.FC<{ at: number; x: number; y: number }> = ({ at, x, y }) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0 || t > 20) return null;
  const size = interpolate(t, [0, 20], [20, 150], { extrapolateRight: "clamp" });
  const opacity = interpolate(t, [0, 20], [0.8, 0], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: 999,
        border: `5px solid ${COLORS.coral}`,
        opacity,
      }}
    />
  );
};

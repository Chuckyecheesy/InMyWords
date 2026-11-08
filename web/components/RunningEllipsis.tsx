"use client";

/** Animated ".", "..", "..." so a long step doesn't look frozen. */
export function RunningEllipsis() {
  return <span className="running-ellipsis" aria-hidden="true" />;
}

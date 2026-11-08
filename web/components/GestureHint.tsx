"use client";

import { useEffect, useRef } from "react";
import { Hand, ThumbsUp } from "lucide-react";
import { onGesture } from "@/lib/input/gestures";

/**
 * Thumbs-up = yes, open palm = no (GAZE_GESTURE_PLAN §5). Screens that
 * accept gestures render this next to their approve/cancel buttons —
 * elsewhere nothing listens, so gestures are ignored by design.
 */
export function GestureHint({
  enabled,
  onYes,
  onNo,
}: {
  enabled: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  const yesRef = useRef(onYes);
  const noRef = useRef(onNo);
  yesRef.current = onYes;
  noRef.current = onNo;

  useEffect(() => {
    if (!enabled) return;
    return onGesture(({ name }) => {
      if (name === "Thumb_Up") yesRef.current();
      if (name === "Open_Palm") noRef.current();
    });
  }, [enabled]);

  if (!enabled) return null;
  return (
    <p className="gesture-hint" aria-hidden="true">
      <span>
        <ThumbsUp size={18} /> Thumbs up = yes
      </span>
      <span>
        <Hand size={18} /> Open hand = no
      </span>
    </p>
  );
}

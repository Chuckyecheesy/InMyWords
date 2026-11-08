"use client";

import { useEffect, useState } from "react";
import { hasCameraConsent, setCameraConsent } from "@/lib/input/consent";
import { BigButton } from "./shared";

/**
 * "Use my eyes and hands" — off by default, one tap off, visible indicator
 * whenever the camera runs (GAZE_GESTURE_PLAN §5). Nothing camera-related
 * starts unless this is on.
 */
export function CameraConsent({
  residentId,
  cameraOn,
  onChange,
}: {
  residentId: string;
  cameraOn: boolean;
  onChange: (consent: boolean) => void;
}) {
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    setConsent(hasCameraConsent(residentId));
  }, [residentId]);

  function toggle() {
    const next = !consent;
    setConsent(next);
    setCameraConsent(residentId, next);
    onChange(next);
  }

  return (
    <section className="block camera-consent" aria-label="Camera consent">
      <div className="speak-actions">
        <BigButton tone={consent ? "approve" : "neutral"} onClick={toggle} aria-pressed={consent}>
          {consent ? "Using my eyes and hands" : "Use my eyes and hands"}
        </BigButton>
        {cameraOn ? (
          <span className="camera-indicator" role="status" aria-live="polite">
            ● Camera on
          </span>
        ) : null}
      </div>
      <p className="note">The camera stays on this tablet. No video is saved.</p>
    </section>
  );
}

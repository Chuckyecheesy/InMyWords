"use client";

import { useState } from "react";
import { hasCameraConsent, setCameraConsent } from "@/lib/input/consent";
import { speak } from "@/lib/api";
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
  const [savedConsent, setSavedConsent] = useState(() => ({
    residentId,
    consent: hasCameraConsent(residentId),
  }));
  const consent =
    savedConsent.residentId === residentId
      ? savedConsent.consent
      : hasCameraConsent(residentId);

  function toggle() {
    const next = !consent;
    setSavedConsent({ residentId, consent: next });
    setCameraConsent(residentId, next);
    onChange(next);
  }

  function hear(label: string) {
    void speak({ resident_id: residentId, text: label });
  }

  return (
    <section className="block camera-consent" aria-label="Camera consent">
      <div className="speak-actions">
        <BigButton tone={consent ? "approve" : "neutral"} onLongPress={hear} onClick={toggle} aria-pressed={consent}>
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

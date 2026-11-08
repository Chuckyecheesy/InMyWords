"use client";

import { useState } from "react";
import { Camera, CameraOff } from "lucide-react";
import { speak } from "@/lib/api";
import { hasCameraConsent, setCameraConsent } from "@/lib/input/consent";
import { useLongPress } from "./shared";

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
    savedConsent.residentId === residentId ? savedConsent.consent : hasCameraConsent(residentId);
  const label = consent ? "Using my eyes and hands" : "Use my eyes and hands";
  const press = useLongPress((text) => {
    void speak({ resident_id: residentId, text });
  }, label);

  function toggle() {
    const next = !consent;
    setSavedConsent({ residentId, consent: next });
    setCameraConsent(residentId, next);
    onChange(next);
  }

  return (
    <div className="camera-consent">
      <button
        type="button"
        className="btn"
        data-variant={consent ? "soft" : "secondary"}
        data-size="lg"
        data-longpress="own"
        aria-pressed={consent}
        onPointerDown={press.onPointerDown}
        onPointerUp={press.onPointerUp}
        onPointerLeave={press.onPointerLeave}
        onPointerCancel={press.onPointerCancel}
        onClick={() => {
          if (press.consumeClick()) return;
          toggle();
        }}
      >
        {consent ? <Camera size={22} aria-hidden="true" /> : <CameraOff size={22} aria-hidden="true" />}
        {label}
      </button>
      {cameraOn ? (
        <span className="camera-indicator" role="status" aria-live="polite">
          <span className="camera-dot" aria-hidden="true" /> Camera on
        </span>
      ) : null}
      <p className="note">The camera stays on this tablet. No video is saved.</p>
    </div>
  );
}

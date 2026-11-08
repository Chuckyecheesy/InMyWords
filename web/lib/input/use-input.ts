"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getCustomGestures, getInputProfile, postInputEvents } from "@/lib/api";
import { hasCameraConsent, setCameraConsent } from "./consent";
import { clearCalibration, hasCalibration, resetForResident, onGaze, startGaze, stopGaze } from "./gaze";
import { setCustomGestures, startGestures, stopGestures } from "./gestures";
import { DEFAULT_PROFILE, startOnTouchGrid } from "./profile";
import { EventQueue } from "./queue";
import type { InputAction, InputOutcome, InputProfile, InputType } from "./types";

export function useInputLayer(residentId: string) {
  const [consent, setConsentState] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [status, setStatus] = useState<"off" | "starting" | "ready" | "lost" | "error">("off");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [calibrationReady, setCalibrationReady] = useState(false);
  const [profile, setProfile] = useState<InputProfile>({ ...DEFAULT_PROFILE, resident_id: residentId });
  const [eyeMode, setEyeMode] = useState(false);
  const queue = useMemo(() => new EventQueue(residentId, async (events) => {
    const result = await postInputEvents(events);
    return result.ok && result.data?.saved === events.length;
  }), [residentId]);

  useEffect(() => { queue.start(); return () => queue.stop(); }, [queue]);
  useEffect(() => {
    let cancelled = false;
    void resetForResident(residentId);
    const ready = hasCalibration(residentId);
    queueMicrotask(() => {
      if (cancelled) return;
      setConsentState(hasCameraConsent(residentId));
      setCalibrationReady(ready);
      setEyeMode(ready);
      setProfile({ ...DEFAULT_PROFILE, resident_id: residentId });
    });
    void getInputProfile(residentId).then((fetched) => {
      if (cancelled) return;
      setProfile(fetched);
      if (ready && fetched.preferred_select === "gaze" && !startOnTouchGrid(fetched)) setEyeMode(true);
    });
    return () => { cancelled = true; };
  }, [residentId]);

  useEffect(() => {
    if (!consent || !hasCameraConsent(residentId)) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) { setStatus("starting"); setError(null); } });
    const unsubscribe = onGaze((_, lost) => {
      if (!cancelled) setStatus((previous) =>
        previous === "ready" || previous === "lost" ? (lost ? "lost" : "ready") : previous);
    });
    void (async () => {
      try {
        await startGaze(residentId);
        if (cancelled) return;
        setCameraOn(true);
        setStatus("ready");
      } catch (cause) {
        if (!cancelled) {
          setStatus("error");
          setError(cause instanceof Error ? cause.message : "The camera could not start. Check camera permissions.");
        }
        return;
      }
      try {
        await startGestures();
        if (cancelled) return;
        const taught = await getCustomGestures(residentId);
        if (!cancelled) setCustomGestures(taught);
      } catch {
        if (!cancelled) setError("Hand gestures are unavailable. You can still use your eyes or tap.");
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe();
      stopGestures();
      stopGaze();
      setCameraOn(false);
      setStatus("off");
    };
  }, [consent, residentId, attempt]);

  const setConsent = useCallback((value: boolean) => {
    setCameraConsent(residentId, value);
    setConsentState(value);
    if (!value) {
      stopGestures();
      stopGaze();
      void clearCalibration();
      setCalibrationReady(false);
      setEyeMode(false);
      setError(null);
    }
  }, [residentId]);
  const log = useCallback((inputType: InputType, action: InputAction, target: string, outcome: InputOutcome,
    options: { holdMs?: number; gesture?: string | null; confidence?: number } = {}) => {
    queue.add(inputType, action, target, outcome, options);
  }, [queue]);
  return { consent, setConsent, cameraOn, profile, eyeMode, setEyeMode, log,
    status, error, calibrationReady, retry: () => setAttempt((n) => n + 1) };
}

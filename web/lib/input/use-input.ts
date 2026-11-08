"use client";

/**
 * One hook that owns the whole input layer for a resident screen:
 * consent → camera lifecycle (gaze + gestures, one shared stream) →
 * outcome-event queue → input profile + adaptive settings (G6).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getCustomGestures, getInputProfile, postInputEvents } from "@/lib/api";
import { hasCameraConsent, setCameraConsent } from "./consent";
import { startGaze, stopGaze } from "./gaze";
import { setCustomGestures, startGestures, stopGestures } from "./gestures";
import { DEFAULT_PROFILE, startOnTouchGrid } from "./profile";
import { EventQueue } from "./queue";
import type { InputAction, InputOutcome, InputProfile, InputType } from "./types";

export function useInputLayer(residentId: string) {
  const [consent, setConsentState] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [profile, setProfile] = useState<InputProfile>({
    ...DEFAULT_PROFILE,
    resident_id: residentId,
  });
  const [eyeMode, setEyeMode] = useState(false);

  const queueRef = useRef<EventQueue | null>(null);
  if (!queueRef.current) {
    queueRef.current = new EventQueue(residentId, async (events) => {
      const result = await postInputEvents(events);
      return result.ok;
    });
  }

  useEffect(() => {
    const queue = queueRef.current!;
    queue.start();
    return () => queue.stop();
  }, []);

  useEffect(() => {
    setConsentState(hasCameraConsent(residentId));
    void getInputProfile(residentId).then((fetched) => {
      setProfile(fetched);
      // G6: gaze-first residents start on the eye grid, unless a
      // time-of-day note says touch works better right now.
      if (fetched.preferred_select === "gaze" && !startOnTouchGrid(fetched)) {
        setEyeMode(true);
      }
    });
  }, [residentId]);

  useEffect(() => {
    if (!consent) return;
    let cancelled = false;
    void (async () => {
      try {
        await startGaze();
        if (cancelled) return;
        setCameraOn(true);
        await startGestures(); // reads WebGazer's video element
        // G8: load any taught personal gestures into the recognition loop.
        const taught = await getCustomGestures(residentId);
        if (!cancelled) setCustomGestures(taught);
      } catch (error) {
        console.warn("[input] camera start failed", error);
      }
    })();
    return () => {
      cancelled = true;
      stopGestures();
      stopGaze();
      setCameraOn(false);
    };
  }, [consent]);

  const setConsent = useCallback(
    (value: boolean) => {
      setCameraConsent(residentId, value);
      setConsentState(value);
      if (!value) setEyeMode(false);
    },
    [residentId],
  );

  const log = useCallback(
    (
      inputType: InputType,
      action: InputAction,
      target: string,
      outcome: InputOutcome,
      options: { holdMs?: number; gesture?: string | null; confidence?: number } = {},
    ) => {
      queueRef.current?.add(inputType, action, target, outcome, options);
    },
    [],
  );

  return { consent, setConsent, cameraOn, profile, eyeMode, setEyeMode, log };
}

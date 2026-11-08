"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, Camera, CameraOff, Eye, Hand, MousePointer2 } from "lucide-react";
import { hasCameraConsent, setCameraConsent } from "@/lib/input/consent";
import { gazeVideoElement, hasCalibration, onGaze, startGaze, stopGaze } from "@/lib/input/gaze";
import { onHandPointer, startGestures, stopGestures } from "@/lib/input/gestures";
import {
  BubbleMagnet,
  GAZE_STALE_MS,
  GazeLatch,
  type ZoneRect,
} from "@/lib/input/gaze-zones";
import { HoldSelector, type PointerPoint } from "@/lib/input/hand-pointer";

type Mode = "touch" | "gaze" | "hand";

const GAZE_HINT = "Your camera stays on this device. No video is saved. Hold your look for about two seconds. Then look left to cancel or right to add it. Ctrl+J starts or stops the camera.";
const HAND_HINT = "Your camera stays on this device. No video is saved. Hold for one second to select. Ctrl+J starts or stops the camera.";
const TOUCH_HINT = "Your camera stays on this device. No video is saved. Ctrl+J starts the camera.";

function gazeBubbles(root: HTMLElement, confirming: boolean): ZoneRect[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button[data-service-target]"))
    .filter((button) => {
      const id = button.dataset.serviceTarget;
      if (!id || button.disabled) return false;
      if (!confirming) return true;
      return id === "gaze:cancel" || id === "gaze:confirm";
    })
    .map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        id: button.dataset.serviceTarget ?? "",
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      };
    });
}

export function ServiceInput({ residentId, region, screen, disabled, onSelect, defaultMode = "touch", compact = false }: {
  residentId: string; region: RefObject<HTMLDivElement | null>; screen: string;
  disabled: boolean; onSelect: (target: string, mode: Mode) => void;
  defaultMode?: Mode;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [point, setPoint] = useState<PointerPoint | null>(null);
  const [locked, setLocked] = useState(false);
  const [hold, setHold] = useState({ target: null as string | null, progress: 0 });
  const [calibrated, setCalibrated] = useState(false);
  const preview = useRef<HTMLVideoElement>(null);
  const settings = useRef<HTMLDetailsElement>(null);
  const enabledRef = useRef(enabled);
  const modeRef = useRef(mode);
  useEffect(() => { enabledRef.current = enabled; modeRef.current = mode; }, [enabled, mode]);
  const callback = useRef(onSelect);
  const lastSelectedTarget = useRef<string | null>(null);
  useEffect(() => { callback.current = onSelect; }, [onSelect]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const saved = localStorage.getItem(`imw-service-mode-${residentId}`);
        if (saved === "touch" || saved === "hand" || saved === "gaze") setMode(saved);
      } catch { /* touch remains available */ }
      setCalibrated(hasCalibration(residentId));
    });
    return () => { cancelled = true; };
  }, [residentId]);

  useEffect(() => {
    if (!enabled || mode === "touch" || !hasCameraConsent(residentId)) return;
    let cancelled = false;
    const video = preview.current;
    void (async () => {
      let cause: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await startGaze(residentId);
          if (cancelled) return;
          if (mode === "hand") await startGestures();
          if (cancelled) return;
          if (video) video.srcObject = gazeVideoElement()?.srcObject ?? null;
          setReady(true);
          setError(null);
          return;
        } catch (error) {
          cause = error;
          stopGestures(); stopGaze();
          const message = error instanceof Error ? error.message : "";
          // A restart can 502 the tracker script once. Try again before giving up.
          if (cancelled || !message.includes("could not load") || attempt === 2) break;
          await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
          if (cancelled) return;
        }
      }
      if (!cancelled) {
        setReady(false);
        setEnabled(false);
        setError(cause instanceof Error ? cause.message : "The camera could not start. Try again or tap your choices.");
      }
    })();
    return () => {
      cancelled = true;
      stopGestures(); stopGaze(); setReady(false); setPoint(null);
      if (video) video.srcObject = null;
    };
  }, [enabled, mode, residentId]);

  useEffect(() => {
    const root = region.current;
    if (!root) return;
    if (ready && mode === "gaze") root.setAttribute("data-gaze-live", "true");
    else root.removeAttribute("data-gaze-live");
    return () => root.removeAttribute("data-gaze-live");
  }, [ready, mode, region]);

  useEffect(() => {
    if (!ready || disabled || (mode === "gaze" && !calibrated)) {
      queueMicrotask(() => setHold({ target: null, progress: 0 }));
      return;
    }
    const handSelector = new HoldSelector();
    const gazeLatch = new GazeLatch();
    const magnet = new BubbleMagnet();
    let sample: PointerPoint | null = null;
    let sampleAt = 0;
    const receive = (next: PointerPoint | null) => { sample = next; sampleAt = performance.now(); };
    const unsubscribe = mode === "hand" ? onHandPointer(receive) : onGaze((next, lost) => receive(lost ? null : next));
    let frame = 0;
    const act = (target: string) => {
      if (target === "input:up" || target === "input:down") {
        window.scrollBy({ top: window.innerHeight * (target === "input:up" ? -.6 : .6), behavior: "smooth" });
      } else if (target === "input:off" || target === "input:dock-off") {
        setCameraConsent(residentId, false); setEnabled(false);
      } else callback.current(target, mode);
    };
    const tick = () => {
      const now = performance.now();
      const freshFor = mode === "gaze" ? GAZE_STALE_MS : 250;
      const current = sample && now - sampleAt < freshFor ? sample : null;
      if (mode === "gaze") {
        const root = region.current;
        const confirming = !!root?.querySelector("[data-service-target='gaze:confirm']");
        if (!current) magnet.clear();
        const snapped = current && root ? magnet.snap(current, gazeBubbles(root, confirming)) : null;
        setPoint(snapped?.id ? { x: snapped.x, y: snapped.y } : current);
        setLocked(!!snapped?.id);
        const zone = snapped?.id ?? null;
        const result = gazeLatch.push(zone, now);
        setHold({ target: result.target, progress: result.progress });
        if (result.select && result.target) act(result.target);
      } else {
        setPoint(current);
        setLocked(false);
        const hit = current ? document.elementFromPoint(current.x, current.y)?.closest<HTMLButtonElement>("button[data-service-target]") : null;
        const target = hit && region.current?.contains(hit) && !hit.disabled ? hit.dataset.serviceTarget ?? null : null;
        // Disabled buttons may have pointer-events:none. Use the previous button's
        // rectangle to distinguish a real look-away from an action becoming busy.
        const previous = Array.from(region.current?.querySelectorAll<HTMLButtonElement>("[data-service-target]") ?? [])
          .find((button) => button.dataset.serviceTarget === lastSelectedTarget.current)?.getBoundingClientRect();
        const stillOnPrevious = current && previous && previous.width > 0 && previous.height > 0
          && current.x >= previous.left && current.x <= previous.right
          && current.y >= previous.top && current.y <= previous.bottom;
        if (current && !stillOnPrevious) lastSelectedTarget.current = null;
        const result = handSelector.push(target === lastSelectedTarget.current ? null : target, now);
        setHold({ target: result.target, progress: result.progress });
        if (result.select && target) {
          lastSelectedTarget.current = target;
          act(target);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { unsubscribe(); cancelAnimationFrame(frame); };
  }, [ready, mode, region, screen, disabled, calibrated, residentId]);

  useEffect(() => {
    const buttons = region.current?.querySelectorAll<HTMLButtonElement>("[data-service-target]");
    buttons?.forEach((button) => {
      const active = button.dataset.serviceTarget === hold.target;
      button.toggleAttribute("data-holding", active);
      button.style.setProperty("--hold-progress", `${active ? hold.progress * 100 : 0}%`);
    });
    return () => { buttons?.forEach((button) => { button.removeAttribute("data-holding"); button.style.removeProperty("--hold-progress"); }); };
  }, [hold, region]);

  const toggleCamera = useCallback(() => {
    const next = !enabledRef.current;
    setError(null);
    if (next && modeRef.current === "touch") setMode("gaze");
    setCameraConsent(residentId, next);
    setEnabled(next);
  }, [residentId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.repeat || event.altKey || event.shiftKey || !event.ctrlKey || event.key.toLowerCase() !== "j") return;
      const el = event.target;
      if (el instanceof HTMLElement && el.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      toggleCamera();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCamera]);

  function choose(next: Mode) {
    setEnabled(false); setReady(false); setPoint(null); setMode(next); setError(null);
    if (settings.current) settings.current.open = false;
    try { localStorage.setItem(`imw-service-mode-${residentId}`, next); } catch { /* this session still works */ }
  }

  const modes = <div className="service-modes" role="group" aria-label="Input method">
        {([{ id: "touch", label: "Touch", Icon: MousePointer2 }, { id: "hand", label: "Hand", Icon: Hand }, { id: "gaze", label: "Eyes", Icon: Eye }] as const).map(({ id, label, Icon }) =>
          <button type="button" key={id} className="btn" aria-label={label} aria-pressed={mode === id} onClick={() => choose(id)}><Icon size={22} aria-hidden="true" />{label}</button>)}
      </div>;
  return <section className="service-input" aria-label="Choose how to select">
    <div className="service-input-controls">
      {compact ? <details className="service-settings" ref={settings}>
        <summary className="btn">{mode === "gaze" ? <Eye size={22} aria-hidden="true" /> : mode === "hand" ? <Hand size={22} aria-hidden="true" /> : <MousePointer2 size={22} aria-hidden="true" />}{mode === "gaze" ? "Eye controls" : mode === "hand" ? "Hand controls" : "Touch controls"}</summary>
        <div className="service-settings-body">{modes}<p className="note">{mode === "gaze" ? GAZE_HINT : mode === "hand" ? HAND_HINT : TOUCH_HINT}</p></div>
      </details> : modes}
      {mode !== "touch" && <button type="button" className="btn" data-service-target={enabled ? "input:off" : undefined} aria-keyshortcuts="Control+J" onClick={toggleCamera} aria-pressed={enabled}>
        {enabled ? <CameraOff size={22} aria-hidden="true" /> : <Camera size={22} aria-hidden="true" />}
        {enabled ? "Turn camera off" : "Turn camera on"}
      </button>}
    </div>
    {mode !== "touch" && <div className="service-input-feedback">
      <video ref={preview} autoPlay playsInline muted className="service-camera" aria-label="Mirrored camera preview" aria-describedby="service-camera-status" hidden={!ready} />
      <button type="button" className="btn" data-size="sm" disabled={!enabled} aria-label="Stop camera"
        onClick={() => { setCameraConsent(residentId, false); setEnabled(false); }}>
        <CameraOff size={18} aria-hidden="true" /> Stop camera
      </button>
      <div>
        <p id="service-camera-status" role="status" aria-live="polite">{!enabled ? "Camera off. Turn it on when you are ready." : !ready ? (error ? "Camera unavailable." : "Starting camera…") : mode === "hand" ? (point ? "Hand detected. Hold the pointer over a choice." : "Camera on. Show your hand with your index finger raised.") : calibrated ? (point ? "Camera on. Hold your look for about two seconds." : "Camera on. Looking for your eyes…") : "Camera on. Set up your eyes before selecting."}</p>
        {!compact && <p className="note">{mode === "gaze" ? GAZE_HINT : HAND_HINT}</p>}
        {mode === "gaze" && !calibrated && <Link href={`/resident/${residentId}/calibrate`} className="text-link">Set up my eyes</Link>}
      </div>
    </div>}
    {error && <p role="alert">{error} Tap Turn camera on to retry, or tap your choices.</p>}
    {ready && point && !disabled && <div className={`service-pointer${locked ? " is-locked" : ""}`} aria-hidden="true" style={{ left: point.x, top: point.y }} />}
    {ready && <div className="service-input-dock" role="group" aria-label="Camera navigation">
      <button type="button" className="btn" data-service-target="input:up" aria-label="Scroll up" onClick={() => window.scrollBy({ top: -window.innerHeight * .6, behavior: "smooth" })}><ArrowUp size={28} aria-hidden="true" /></button>
      <button type="button" className="btn" data-service-target="input:down" aria-label="Scroll down" onClick={() => window.scrollBy({ top: window.innerHeight * .6, behavior: "smooth" })}><ArrowDown size={28} aria-hidden="true" /></button>
      <button type="button" className="btn" data-service-target="input:dock-off" aria-keyshortcuts="Control+J" onClick={toggleCamera}><CameraOff size={24} aria-hidden="true" />Camera off</button>
    </div>}
  </section>;
}

"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, Camera, CameraOff, Eye, Hand, MousePointer2 } from "lucide-react";
import { hasCameraConsent, setCameraConsent } from "@/lib/input/consent";
import { gazeVideoElement, hasCalibration, onGaze, startGaze, stopGaze } from "@/lib/input/gaze";
import { onHandPointer, startGestures, stopGestures } from "@/lib/input/gestures";
import { HoldSelector, type PointerPoint } from "@/lib/input/hand-pointer";

type Mode = "touch" | "gaze" | "hand";

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
  const [hold, setHold] = useState({ target: null as string | null, progress: 0 });
  const [calibrated, setCalibrated] = useState(false);
  const preview = useRef<HTMLVideoElement>(null);
  const settings = useRef<HTMLDetailsElement>(null);
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
      try {
        await startGaze(residentId);
        if (cancelled) return;
        if (mode === "hand") await startGestures();
        if (cancelled) return;
        if (video) video.srcObject = gazeVideoElement()?.srcObject ?? null;
        setReady(true);
      } catch (cause) {
        if (!cancelled) {
          stopGestures(); stopGaze();
          setError(cause instanceof Error ? cause.message : "The camera could not start. Try again or tap your choices.");
        }
      }
    })();
    return () => {
      cancelled = true;
      stopGestures(); stopGaze(); setReady(false); setPoint(null);
      if (video) video.srcObject = null;
    };
  }, [enabled, mode, residentId]);

  useEffect(() => {
    if (!ready || disabled || (mode === "gaze" && !calibrated)) {
      queueMicrotask(() => setHold({ target: null, progress: 0 }));
      return;
    }
    const selector = new HoldSelector();
    let sample: PointerPoint | null = null;
    let sampleAt = 0;
    const receive = (next: PointerPoint | null) => { sample = next; sampleAt = performance.now(); };
    const unsubscribe = mode === "hand" ? onHandPointer(receive) : onGaze((next, lost) => receive(lost ? null : next));
    let frame = 0;
    const tick = () => {
      const now = performance.now();
      const current = sample && now - sampleAt < 250 ? sample : null;
      setPoint(current);
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
      const result = selector.push(target === lastSelectedTarget.current ? null : target, now);
      setHold({ target: result.target, progress: result.progress });
      if (result.select && target) {
        lastSelectedTarget.current = target;
        if (target === "input:up" || target === "input:down") {
          window.scrollBy({ top: window.innerHeight * (target === "input:up" ? -.6 : .6), behavior: "smooth" });
        } else if (target === "input:off" || target === "input:dock-off") {
          setCameraConsent(residentId, false); setEnabled(false);
        } else callback.current(target, mode);
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

  function choose(next: Mode) {
    setEnabled(false); setReady(false); setPoint(null); setMode(next); setError(null);
    if (settings.current) settings.current.open = false;
    try { localStorage.setItem(`imw-service-mode-${residentId}`, next); } catch { /* this session still works */ }
  }

  const modes = <div className="service-modes" role="group" aria-label="Input method">
        {([{ id: "touch", label: "Touch", Icon: MousePointer2 }, { id: "hand", label: "Hand", Icon: Hand }, { id: "gaze", label: "Eyes", Icon: Eye }] as const).map(({ id, label, Icon }) =>
          <button type="button" key={id} className="btn" aria-pressed={mode === id} onClick={() => choose(id)}><Icon size={22} aria-hidden="true" />{label}</button>)}
      </div>;
  return <section className="service-input" aria-label="Choose how to select">
    <div className="service-input-controls">
      {compact ? <details className="service-settings" ref={settings}>
        <summary className="btn">{mode === "gaze" ? <Eye size={22} aria-hidden="true" /> : mode === "hand" ? <Hand size={22} aria-hidden="true" /> : <MousePointer2 size={22} aria-hidden="true" />}{mode === "gaze" ? "Eye controls" : mode === "hand" ? "Hand controls" : "Touch controls"}</summary>
        <div className="service-settings-body">{modes}<p className="note">Your camera stays on this device. No video is saved. Hold for one second to select.</p></div>
      </details> : modes}
      {mode !== "touch" && <button type="button" className="btn" data-service-target={enabled ? "input:off" : undefined} onClick={() => {
        setError(null); setCameraConsent(residentId, !enabled); setEnabled(!enabled);
      }} aria-pressed={enabled}>
        {enabled ? <CameraOff size={22} aria-hidden="true" /> : <Camera size={22} aria-hidden="true" />}
        {enabled ? "Turn camera off" : "Turn camera on"}
      </button>}
    </div>
    {mode !== "touch" && <div className="service-input-feedback">
      <video ref={preview} autoPlay playsInline muted className="service-camera" aria-label="Mirrored camera preview" hidden={!ready} />
      <div>
        <p role="status" aria-live="polite">{!enabled ? "Camera off. Turn it on when you are ready." : !ready ? (error ? "Camera unavailable." : "Starting camera…") : mode === "hand" ? (point ? "Hand detected. Hold the pointer over a choice." : "Camera on. Show your hand with your index finger raised.") : calibrated ? (point ? "Camera on. Look at a choice and hold." : "Camera on. Looking for your eyes…") : "Camera on. Set up your eyes before selecting."}</p>
        {!compact && <p className="note">Your camera stays on this device. No video is saved. Hold for one second to select.</p>}
        {mode === "gaze" && !calibrated && <Link href={`/resident/${residentId}/calibrate`} className="text-link">Set up my eyes</Link>}
      </div>
    </div>}
    {error && <p role="alert">{error} Turn the camera off and on to retry, or tap your choices.</p>}
    {ready && point && !disabled && <div className="service-pointer" aria-hidden="true" style={{ left: point.x, top: point.y }} />}
    {ready && <div className="service-input-dock" role="group" aria-label="Camera navigation">
      <button type="button" className="btn" data-service-target="input:up" aria-label="Scroll up" onClick={() => window.scrollBy({ top: -window.innerHeight * .6, behavior: "smooth" })}><ArrowUp size={28} aria-hidden="true" /></button>
      <button type="button" className="btn" data-service-target="input:down" aria-label="Scroll down" onClick={() => window.scrollBy({ top: window.innerHeight * .6, behavior: "smooth" })}><ArrowDown size={28} aria-hidden="true" /></button>
      <button type="button" className="btn" data-service-target="input:dock-off" onClick={() => { setCameraConsent(residentId, false); setEnabled(false); }}><CameraOff size={24} aria-hidden="true" />Camera off</button>
    </div>}
  </section>;
}

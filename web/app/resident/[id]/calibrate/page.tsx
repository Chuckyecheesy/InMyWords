"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CameraOff, Eye, Hand, Sparkles } from "lucide-react";
import { hasCameraConsent } from "@/lib/input/consent";
import {
  cameraStartMessage,
  clearCalibration,
  completeCalibration,
  resetGazeSamples,
  resetForResident,
  currentGaze,
  freezeLearning,
  recordCalibrationPoint,
  startGaze,
  stopGaze,
} from "@/lib/input/gaze";

/**
 * 9-point calibration + accuracy check (GAZE_GESTURE_PLAN §5, G2).
 * Targets at 10/50/90% of width and height, 5 taps each while looking.
 * Accuracy: 5 random points; Good < 15% of screen width, Okay 15–25%,
 * Try again > 25%. Session-only, nothing persists.
 */

const POSITIONS = [0.1, 0.5, 0.9].flatMap((y) => [0.1, 0.5, 0.9].map((x) => ({ x, y })));
const TAPS_PER_TARGET = 5;
const CHECK_POINTS = 5;

type Phase = "consent" | "intro" | "calibrating" | "checking" | "done";

export default function CalibratePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [phase, setPhase] = useState<Phase>("intro");
  const [targetIndex, setTargetIndex] = useState(0);
  const [taps, setTaps] = useState(0);
  const [checkIndex, setCheckIndex] = useState(0);
  const [checkTarget, setCheckTarget] = useState({ x: 0.5, y: 0.5 });
  const distances = useRef<number[]>([]);
  const targetRef = useRef<HTMLButtonElement | null>(null);
  const targetSince = useRef(0);
  const cancelled = useRef(false);
  const lifecycle = useRef(0);
  const [sampleMessage, setSampleMessage] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [result, setResult] = useState<"good" | "okay" | "retry" | null>(null);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    cancelled.current = false;
    const token = ++lifecycle.current;
    void resetForResident(id);
    queueMicrotask(() => {
      if (token !== lifecycle.current) return;
      setPhase(hasCameraConsent(id) ? "intro" : "consent");
      setCameraOn(false);
      setResult(null);
    });
    return () => { cancelled.current = true; lifecycle.current = token + 1; stopGaze(); };
  }, [id]);

  useEffect(() => {
    resetGazeSamples();
    targetSince.current = performance.now();
  }, [phase, targetIndex, checkIndex]);

  async function begin() {
    const token = lifecycle.current;
    setStarting(true);
    setCameraError(null);
    try {
      await startGaze(id);
      if (cancelled.current || token !== lifecycle.current) return;
      setCameraOn(true);
      await clearCalibration();
      if (cancelled.current || token !== lifecycle.current) return;
      setPhase("calibrating");
      setTargetIndex(0);
      setTaps(0);
    } catch (error) {
      if (!cancelled.current && token === lifecycle.current) setCameraError(cameraStartMessage(error));
    } finally {
      if (!cancelled.current && token === lifecycle.current) setStarting(false);
    }
  }

  function tapTarget() {
    const rect = targetRef.current?.getBoundingClientRect();
    if (!rect || !recordCalibrationPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)) {
      setSampleMessage("I can't see your eyes yet. Face the camera, then tap again.");
      return;
    }
    setSampleMessage(null);
    if (taps + 1 < TAPS_PER_TARGET) {
      setTaps(taps + 1);
      return;
    }
    if (targetIndex + 1 < POSITIONS.length) {
      setTargetIndex(targetIndex + 1);
      setTaps(0);
      return;
    }
    freezeLearning();
    distances.current = [];
    setCheckTarget({ x: 0.15 + Math.random() * 0.7, y: 0.15 + Math.random() * 0.7 });
    setCheckIndex(0);
    setPhase("checking");
  }

  function measureCheckPoint() {
    const gaze = currentGaze(targetSince.current);
    const rect = targetRef.current?.getBoundingClientRect();
    if (!gaze || !rect) {
      setSampleMessage("Look at the circle while facing the camera, then tap again.");
      return;
    }
    setSampleMessage(null);
    distances.current.push(Math.hypot(gaze.x - rect.left - rect.width / 2, gaze.y - rect.top - rect.height / 2));
    if (checkIndex + 1 < CHECK_POINTS) {
      setCheckIndex(checkIndex + 1);
      setCheckTarget({ x: 0.15 + Math.random() * 0.7, y: 0.15 + Math.random() * 0.7 });
      return;
    }
    const avg =
      distances.current.length > 0
        ? distances.current.reduce((a, b) => a + b, 0) / distances.current.length
        : Infinity;
    const fraction = avg / window.innerWidth;
    const outcome = fraction < 0.15 ? "good" : fraction <= 0.25 ? "okay" : "retry";
    if (outcome !== "retry") completeCalibration(id);
    setResult(outcome);
    setPhase("done");
  }

  if (phase === "consent") {
    return (
      <div className="stack calibrate-page">
        <header className="page-head">
          <p className="eyebrow">My eyes</p>
          <h1>Set up my eyes</h1>
        </header>
        <div className="card card-pad setup-card">
          <span className="setup-icon" aria-hidden="true">
            <CameraOff size={34} />
          </span>
          <p className="lead">
            Turn on &ldquo;Use my eyes and hands&rdquo; on the home screen first. The camera
            stays on this tablet. No video is saved.
          </p>
          <Link href={`/resident/${id}/speak`} className="btn" data-variant="primary" data-size="lg">
            Back to my tiles
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="stack calibrate-page">
        <header className="page-head">
          <p className="eyebrow">My eyes</p>
          <h1>Set up my eyes</h1>
          <p className="lead">It takes about a minute. Sit comfortably, an arm&rsquo;s length away.</p>
        </header>
        <div className="card card-pad setup-card">
          <ol className="setup-steps">
            <li>
              <span className="setup-step-icon" aria-hidden="true">⭐</span>
              <strong>Look</strong>
              <span>at each star</span>
            </li>
            <li>
              <span className="setup-step-icon" aria-hidden="true">👆</span>
              <strong>Tap it</strong>
              <span>5 times</span>
            </li>
            <li>
              <span className="setup-step-icon" aria-hidden="true">✨</span>
              <strong>Quick check</strong>
              <span>5 circles</span>
            </li>
          </ol>
          <button
            type="button"
            className="btn"
            data-variant="primary"
            data-size="xl"
            onClick={() => void begin()}
            disabled={starting}
          >
            <Eye size={24} aria-hidden="true" />
            {starting ? "Starting camera…" : "Start"}
          </button>
          {cameraError ? (
            <p className="note" role="status">
              {cameraError}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (phase === "calibrating") {
    const pos = POSITIONS[targetIndex];
    return (
      <div className="calibrate-stage">
        <div className="calibrate-hud card" role="status">
          <span>Camera on</span>
          {sampleMessage ? <span>{sampleMessage}</span> : null}
          <span className="calibrate-hud-label">
            Star {targetIndex + 1} of {POSITIONS.length}
          </span>
          <span className="tap-dots" aria-hidden="true">
            {Array.from({ length: TAPS_PER_TARGET }, (_, i) => (
              <span key={i} className="tap-dot" data-done={i < taps} />
            ))}
          </span>
          <span className="calibrate-hud-hint">tap {TAPS_PER_TARGET - taps} more</span>
        </div>
        <button
          type="button"
          ref={targetRef}
          className="calibrate-target pulse-slow"
          style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
          onClick={tapTarget}
          aria-label={`Calibration star ${targetIndex + 1}, look at it and tap`}
        >
          ⭐
        </button>
      </div>
    );
  }

  if (phase === "checking") {
    return (
      <div className="calibrate-stage">
        <div className="calibrate-hud card" role="status">
          <span>Camera on</span>
          {sampleMessage ? <span>{sampleMessage}</span> : null}
          <span className="calibrate-hud-label">
            Check {checkIndex + 1} of {CHECK_POINTS}
          </span>
          <span className="calibrate-hud-hint">look at the circle, then tap it</span>
        </div>
        <button
          type="button"
          ref={targetRef}
          className="calibrate-target check pulse-slow"
          style={{ left: `${checkTarget.x * 100}%`, top: `${checkTarget.y * 100}%` }}
          onClick={measureCheckPoint}
          aria-label="Accuracy check point"
        >
          ◎
        </button>
      </div>
    );
  }

  return (
    <div className="stack calibrate-page">
      {cameraOn ? <p role="status">Camera on</p> : null}
      <div className="card card-pad setup-card result-card" data-result={result ?? "okay"}>
        <span className="setup-icon" aria-hidden="true">
          {result === "retry" ? <Hand size={34} /> : <Sparkles size={34} />}
        </span>
        <h1>
          {result === "good" ? "Lovely!" : result === "okay" ? "That works" : "Let’s try again"}
        </h1>
        <p className="lead">
          {result === "retry"
            ? "Sit 50–70 cm from the screen with light on your face, then try again."
            : "Your eyes are ready. This lasts until this page is reloaded."}
        </p>
        <div className="setup-actions">
          {result === "retry" ? (
            <button type="button" className="btn" data-variant="primary" data-size="xl" onClick={() => void begin()}>
              Try again
            </button>
          ) : null}
          <Link
            href={`/resident/${id}/speak`}
            className="btn"
            data-variant={result === "retry" ? "soft" : "primary"}
            data-size="xl"
          >
            Back to my tiles
          </Link>
        </div>
      </div>
    </div>
  );
}

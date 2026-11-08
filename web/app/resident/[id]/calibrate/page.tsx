"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { hasCameraConsent } from "@/lib/input/consent";
import {
  clearCalibration,
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
 * Try again > 25%. Session-only — nothing persists.
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
  const [result, setResult] = useState<"good" | "okay" | "retry" | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!hasCameraConsent(id)) setPhase("consent");
    return () => stopGaze();
  }, [id]);

  async function begin() {
    setStarting(true);
    clearCalibration();
    await startGaze();
    setStarting(false);
    setPhase("calibrating");
    setTargetIndex(0);
    setTaps(0);
  }

  function tapTarget() {
    const pos = POSITIONS[targetIndex];
    recordCalibrationPoint(pos.x * window.innerWidth, pos.y * window.innerHeight);
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
    const gaze = currentGaze();
    const tx = checkTarget.x * window.innerWidth;
    const ty = checkTarget.y * window.innerHeight;
    if (gaze) {
      distances.current.push(Math.hypot(gaze.x - tx, gaze.y - ty));
    }
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
    setResult(fraction < 0.15 ? "good" : fraction <= 0.25 ? "okay" : "retry");
    setPhase("done");
  }

  if (phase === "consent") {
    return (
      <div className="stack calibrate-page">
        <h1>Set up my eyes</h1>
        <p>
          Turn on “Use my eyes and hands” on the home screen first. The camera stays on this
          tablet. No video is saved.
        </p>
        <Link href={`/resident/${id}`} className="tile tile-button">
          <span className="tile-label">Back to my tiles</span>
        </Link>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="stack calibrate-page">
        <h1>Set up my eyes</h1>
        <p>Look at each star, then tap it 5 times. It takes about a minute.</p>
        <button type="button" className="tile tile-button" onClick={() => void begin()} disabled={starting}>
          <span className="tile-label">{starting ? "Starting camera…" : "Start"}</span>
        </button>
      </div>
    );
  }

  if (phase === "calibrating") {
    const pos = POSITIONS[targetIndex];
    return (
      <div className="calibrate-stage">
        <p className="calibrate-count" role="status">
          Star {targetIndex + 1} of {POSITIONS.length} — tap {TAPS_PER_TARGET - taps} more
        </p>
        <button
          type="button"
          className="calibrate-target"
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
        <p className="calibrate-count" role="status">
          Check {checkIndex + 1} of {CHECK_POINTS} — look at the circle, then tap it
        </p>
        <button
          type="button"
          className="calibrate-target check"
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
      <h1>
        {result === "good" ? "Good! 🎉" : result === "okay" ? "Okay 👍" : "Let’s try again"}
      </h1>
      <p>
        {result === "retry"
          ? "Sit 50–70 cm from the screen with light on your face, then try again."
          : "Your eyes are ready. Calibration lasts until this tablet is closed."}
      </p>
      <div className="speak-actions">
        {result === "retry" ? (
          <button type="button" className="tile tile-button" onClick={() => void begin()}>
            <span className="tile-label">Try again</span>
          </button>
        ) : null}
        <Link href={`/resident/${id}`} className="tile tile-button">
          <span className="tile-label">Back to my tiles</span>
        </Link>
      </div>
    </div>
  );
}

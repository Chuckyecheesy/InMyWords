"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, HandMetal, Sparkles } from "lucide-react";
import { getCustomGestures, saveCustomGesture } from "@/lib/api";
import { hasCameraConsent } from "@/lib/input/consent";
import { normalizeLandmarks, type GestureSample } from "@/lib/input/custom-gestures";
import { cameraStartMessage, startGaze, stopGaze } from "@/lib/input/gaze";
import {
  latestLandmarks,
  onCustomGesture,
  setCustomGestures,
  startGestures,
  stopGestures,
} from "@/lib/input/gestures";
import type { Resident, Tile } from "@/lib/types";
import { TileButton } from "./shared";

const SAMPLES_NEEDED = 5;

/**
 * G8 teach screen: pick a tile, hold your hand shape, capture 5 samples,
 * then try it live. Landmarks only, never video. The taught gesture
 * selects its tile and still goes through the normal confirmation flow.
 */
export function TeachGesture({ resident }: { resident: Resident }) {
  const [consent, setConsent] = useState<boolean | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [tile, setTile] = useState<Tile | null>(null);
  const [samples, setSamples] = useState<GestureSample[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [tryHits, setTryHits] = useState<string[]>([]);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const tryHitsRef = useRef(tryHits);
  tryHitsRef.current = tryHits;

  useEffect(() => {
    setConsent(hasCameraConsent(resident.id));
  }, [resident.id]);

  useEffect(() => {
    if (!consent) return;
    let cancelled = false;
    void (async () => {
      try {
        await startGaze();
        if (cancelled) return;
        setCameraOn(true);
        setMessage(null);
      } catch (error) {
        if (!cancelled) setMessage(cameraStartMessage(error));
        return;
      }
      try {
        await startGestures();
      } catch {
        if (!cancelled) setMessage("The camera is on, but hand tracking did not start. Tap Try again.");
      }
    })();
    return () => {
      cancelled = true;
      stopGestures();
      stopGaze();
    };
  }, [consent, cameraAttempt]);

  useEffect(() => {
    if (!saved) return;
    return onCustomGesture((label) => {
      setTryHits((hits) => [...hits, label].slice(-5));
    });
  }, [saved]);

  function capture() {
    const landmarks = latestLandmarks();
    if (!landmarks) {
      setMessage("I can't see a hand. Hold it up in front of the camera.");
      return;
    }
    const normalized = normalizeLandmarks(landmarks);
    if (!normalized) {
      setMessage("That frame didn't work, try again.");
      return;
    }
    setMessage(null);
    setSamples((current) => [...current, normalized].slice(0, SAMPLES_NEEDED));
  }

  async function save() {
    if (!tile || samples.length < SAMPLES_NEEDED) return;
    const result = await saveCustomGesture({
      resident_id: resident.id,
      tile: tile.label,
      samples,
    });
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    const all = await getCustomGestures(resident.id);
    setCustomGestures(all);
    setSaved(true);
    setMessage(null);
  }

  function reset() {
    setSamples([]);
    setSaved(false);
    setTryHits([]);
  }

  const step = !tile ? 1 : !saved ? 2 : 3;

  if (consent === false) {
    return (
      <div className="stack calibrate-page">
        <header className="page-head">
          <p className="eyebrow">My gestures</p>
          <h1>Teach a gesture</h1>
        </header>
        <div className="card card-pad setup-card">
          <span className="setup-icon" aria-hidden="true">
            <HandMetal size={34} />
          </span>
          <p className="lead">Turn on “Use my eyes and hands” on the home screen first.</p>
          <Link
            prefetch={false}
            href={`/resident/${resident.id}/speak`}
            className="btn"
            data-variant="primary"
            data-size="lg"
          >
            Back to my tiles
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="stack calibrate-page">
      <header className="page-head">
        <p className="eyebrow">My gestures</p>
        <h1>Teach a gesture</h1>
        <p className="lead">Your own hand shape can say a tile for you.</p>
      </header>

      <ol className="teach-steps" aria-label="Steps">
        <li data-state={step === 1 ? "active" : "done"}>
          <span className="teach-step-num" aria-hidden="true">{step > 1 ? "✓" : "1"}</span>
          Pick a picture
        </li>
        <li data-state={step === 2 ? "active" : step > 2 ? "done" : "todo"}>
          <span className="teach-step-num" aria-hidden="true">{step > 2 ? "✓" : "2"}</span>
          Show your hand
        </li>
        <li data-state={step === 3 ? "active" : "todo"}>
          <span className="teach-step-num" aria-hidden="true">3</span>
          Try it
        </li>
      </ol>

      {!tile ? (
        <section className="card card-pad" aria-label="Pick a picture">
          <p className="lead">Pick the picture your gesture should say.</p>
          <div className="tile-grid">
            {resident.tiles.slice(0, 8).map((candidate) => (
              <TileButton key={candidate.id} tile={candidate} onSelect={setTile} />
            ))}
          </div>
        </section>
      ) : !saved ? (
        <section className="card card-pad setup-card" aria-label="Show your hand">
          <span className="setup-icon" aria-hidden="true">
            <HandMetal size={34} />
          </span>
          <p className="lead">
            Make your hand shape for <strong>{tile.label}</strong> and hold it up.
          </p>
          <div className="sample-dots" role="status" aria-label={`${samples.length} of ${SAMPLES_NEEDED} captured`}>
            {Array.from({ length: SAMPLES_NEEDED }, (_, i) => (
              <span key={i} className="sample-dot" data-done={i < samples.length} aria-hidden="true">
                {i < samples.length ? "✓" : i + 1}
              </span>
            ))}
          </div>
          {!cameraOn && !message ? <p className="note">Starting camera…</p> : null}
          {message ? <p className="note">{message}</p> : null}
          <div className="setup-actions">
            <button type="button" className="btn" data-variant="primary" data-size="xl" onClick={capture} disabled={!cameraOn}>
              <Camera size={24} aria-hidden="true" />
              Capture
            </button>
            <button
              type="button"
              className="btn"
              data-variant="soft"
              data-size="xl"
              disabled={samples.length < SAMPLES_NEEDED}
              onClick={() => void save()}
            >
              Save gesture
            </button>
            {!cameraOn ? (
              <button
                type="button"
                className="btn"
                data-variant="soft"
                data-size="lg"
                onClick={() => {
                  setMessage(null);
                  setCameraAttempt((attempt) => attempt + 1);
                }}
              >
                Try again
              </button>
            ) : null}
            <button type="button" className="btn" data-variant="ghost" data-size="lg" onClick={() => { setTile(null); reset(); }}>
              Start over
            </button>
          </div>
        </section>
      ) : (
        <section className="card card-pad setup-card" aria-label="Try it">
          <span className="setup-icon" data-tone="success" aria-hidden="true">
            <Sparkles size={34} />
          </span>
          <p className="lead">
            Saved! Make your <strong>{tile.label}</strong> shape and hold it for half a second.
          </p>
          <p className="note try-status" role="status" aria-live="polite" data-hit={tryHits.length > 0}>
            {tryHits.length === 0
              ? "Waiting for your gesture…"
              : `Recognised: ${tryHits.join(", ")}`}
          </p>
          <div className="setup-actions">
            <button type="button" className="btn" data-variant="soft" data-size="xl" onClick={() => { setTile(null); reset(); }}>
              Teach another
            </button>
            <Link
              prefetch={false}
              href={`/resident/${resident.id}/speak`}
              className="btn"
              data-variant="primary"
              data-size="xl"
            >
              Done
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

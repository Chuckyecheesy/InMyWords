"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getCustomGestures, saveCustomGesture } from "@/lib/api";
import { hasCameraConsent } from "@/lib/input/consent";
import { normalizeLandmarks, type GestureSample } from "@/lib/input/custom-gestures";
import { startGaze, stopGaze } from "@/lib/input/gaze";
import {
  latestLandmarks,
  onCustomGesture,
  setCustomGestures,
  startGestures,
  stopGestures,
} from "@/lib/input/gestures";
import type { Resident, Tile } from "@/lib/types";
import { BigButton, TileButton } from "./shared";

const SAMPLES_NEEDED = 5;

/**
 * G8 teach screen: pick a tile, hold your hand shape, capture 5 samples,
 * then try it live. Landmarks only — never video. The taught gesture
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
        await startGestures();
        if (!cancelled) setCameraOn(true);
      } catch {
        if (!cancelled) setMessage("The camera could not start. Check permissions and HTTPS.");
      }
    })();
    return () => {
      cancelled = true;
      stopGestures();
      stopGaze();
    };
  }, [consent]);

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
      setMessage("That frame didn't work — try again.");
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

  if (consent === false) {
    return (
      <div className="stack calibrate-page">
        <h1>Teach a gesture</h1>
        <p>Turn on “Use my eyes and hands” on the home screen first.</p>
        <Link href={`/resident/${resident.id}`} className="tile tile-button">
          <span className="tile-label">Back to my tiles</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="stack calibrate-page">
      <h1>Teach a gesture</h1>

      {!tile ? (
        <>
          <p>Pick the tile your gesture should say.</p>
          <div className="tile-grid">
            {resident.tiles.slice(0, 8).map((candidate) => (
              <TileButton key={candidate.id} tile={candidate} onSelect={setTile} />
            ))}
          </div>
        </>
      ) : !saved ? (
        <>
          <p>
            Make your hand shape for <strong>{tile.label}</strong> and hold it.
            Capture it {SAMPLES_NEEDED} times.
          </p>
          <p className="note" role="status">
            {samples.length} of {SAMPLES_NEEDED} captured
            {cameraOn ? "" : " — starting camera…"}
          </p>
          {message ? <p className="note">{message}</p> : null}
          <div className="speak-actions">
            <BigButton tone="approve" onClick={capture} disabled={!cameraOn}>
              Capture {samples.length + 1 > SAMPLES_NEEDED ? "" : samples.length + 1}
            </BigButton>
            <BigButton
              tone="neutral"
              disabled={samples.length < SAMPLES_NEEDED}
              onClick={() => void save()}
            >
              Save gesture
            </BigButton>
            <BigButton tone="reject" onClick={() => { setTile(null); reset(); }}>
              Start over
            </BigButton>
          </div>
        </>
      ) : (
        <>
          <p>
            Saved! Try it — make your <strong>{tile.label}</strong> shape and hold it
            for half a second.
          </p>
          <p className="note" role="status" aria-live="polite">
            {tryHits.length === 0
              ? "Waiting for your gesture…"
              : `Recognised: ${tryHits.join(", ")}`}
          </p>
          <div className="speak-actions">
            <BigButton tone="neutral" onClick={() => { setTile(null); reset(); }}>
              Teach another
            </BigButton>
            <Link href={`/resident/${resident.id}`} className="tile tile-button slim">
              <span className="tile-label">Done</span>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { AudioLines, Check, Pause, Play, Undo2, X } from "lucide-react";
import { getVoices, setVoice, type VoiceOption } from "@/lib/api";

const BARS = [0.35, 0.6, 0.9, 0.5, 0.75, 1, 0.65, 0.4, 0.8, 0.55, 0.9, 0.45, 0.7, 0.35];

export function VoicePicker({ residentId, residentName: name }: { residentId: string; residentName: string }) {
  const [options, setOptions] = useState<VoiceOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancel = false;
    getVoices(residentId).then((result) => {
      if (cancel) return;
      setLoaded(true);
      if (!result.ok) {
        setError("The voice service didn't answer. Sentences still use the default voice.");
        return;
      }
      setOptions(result.data.options.slice(0, 3));
      setCurrent(result.data.current);
    });
    return () => {
      cancel = true;
    };
  }, [residentId]);

  function toggle(option: VoiceOption) {
    const node = audioRef.current;
    if (!node) return;
    if (playing === option.voice_id) {
      node.pause();
      setPlaying(null);
      return;
    }
    node.src = option.preview_url;
    void node
      .play()
      .then(() => setPlaying(option.voice_id))
      .catch(() => setError("That preview couldn't play."));
  }

  async function choose(voiceId: string, undo = false) {
    setSaving(voiceId);
    setError(null);
    const result = await setVoice(residentId, voiceId);
    setSaving(null);
    if (!result.ok) {
      setError("Couldn't change the voice just now. Nothing was changed.");
      return;
    }
    setPrevious(undo ? null : current);
    setChanged(!undo);
    setCurrent(voiceId);
  }

  const currentLabel = options.find((option) => option.voice_id === current)?.label;

  return (
    <div className="stack">
      <header className="page-head">
        <p className="eyebrow">My voice</p>
        <h1>Choose a voice</h1>
        <p className="lead">Listen to each voice. Pick the one that feels like you. You can change it any time.</p>
      </header>
      {!loaded ? (
        <div className="voice-grid" aria-hidden="true">
          <div className="skeleton" style={{ height: 260, borderRadius: "var(--r-xl)" }} />
          <div className="skeleton" style={{ height: 260, borderRadius: "var(--r-xl)" }} />
          <div className="skeleton" style={{ height: 260, borderRadius: "var(--r-xl)" }} />
        </div>
      ) : null}
      {loaded && options.length === 0 && !error ? (
        <div className="empty">
          <span className="empty-icon" aria-hidden="true">
            <AudioLines size={30} />
          </span>
          <h2>Voices aren&apos;t ready yet</h2>
        </div>
      ) : null}
      {changed && currentLabel ? (
        <div className="callout" data-tone="success" role="status">
          <Check size={20} aria-hidden="true" />
          <div className="callout-body">
            <span data-testid="voice-choice">
              {name} chose {currentLabel}.
            </span>
            {previous ? (
              <div className="row" style={{ marginTop: 8 }}>
                <button type="button" className="btn" data-size="lg" onClick={() => void choose(previous, true)}>
                  <Undo2 size={20} aria-hidden="true" /> Undo
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="callout" data-tone="error" role="alert">
          <X size={20} aria-hidden="true" />
          <div className="callout-body">{error}</div>
        </div>
      ) : null}
      <div className="voice-grid">
        {options.map((option) => {
          const isCurrent = option.voice_id === current;
          const isPlaying = playing === option.voice_id;
          return (
            <article
              key={option.voice_id}
              className="voice-card"
              data-current={isCurrent ? "" : undefined}
              data-playing={isPlaying ? "" : undefined}
              aria-labelledby={`v-${option.voice_id}`}
            >
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h2 id={`v-${option.voice_id}`} style={{ fontSize: "var(--text-h3)" }}>
                  {option.label}
                </h2>
                {isCurrent ? <span className="badge" data-tone="resident" data-size="lg"><Check size={18} aria-hidden="true" />My voice</span> : null}
              </div>
              <div className="voice-wave" aria-hidden="true">
                {BARS.map((height, index) => (
                  <span key={index} style={{ height: `${height * 100}%`, animationDelay: `${index * 60}ms` }} />
                ))}
              </div>
              {option.preview_text ? <p className="muted">&ldquo;{option.preview_text}&rdquo;</p> : null}
              <div className="row">
                <button
                  type="button"
                  className="btn"
                  data-variant="secondary"
                  data-size="lg"
                  aria-label={isPlaying ? `Pause ${option.label}` : `Play ${option.label}`}
                  onClick={() => toggle(option)}
                >
                  {isPlaying ? <Pause size={22} aria-hidden="true" /> : <Play size={22} aria-hidden="true" />}
                  {isPlaying ? "Pause" : "Play"}
                </button>
                {isCurrent ? null : (
                  <button
                    type="button"
                    className="btn"
                    data-variant="primary"
                    data-size="lg"
                    style={{ flex: 1 }}
                    disabled={saving !== null}
                    onClick={() => void choose(option.voice_id)}
                  >
                    {saving === option.voice_id ? <span className="spinner" aria-hidden="true" /> : null}
                    {`Choose ${option.label}`}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <audio ref={audioRef} onEnded={() => setPlaying(null)} onPause={() => setPlaying(null)} />
    </div>
  );
}

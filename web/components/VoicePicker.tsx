"use client";

import { useEffect, useState } from "react";
import { getVoices, setVoice, speak, type VoiceOption } from "@/lib/api";
import { AudioPlayback, BigButton } from "./shared";

export function VoicePicker({
  residentId,
  residentName,
}: {
  residentId: string;
  residentName: string;
}) {
  const [options, setOptions] = useState<VoiceOption[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    getVoices(residentId).then((result) => {
      if (cancel) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOptions(result.data.options.slice(0, 3));
      setCurrent(result.data.current);
    });
    return () => {
      cancel = true;
    };
  }, [residentId]);

  async function play(option: VoiceOption) {
    setError(null);
    setPlaying(option.preview_url);
    const spoken = await speak({ resident_id: residentId, text: option.preview_text });
    if (!spoken.ok) setError(spoken.error);
  }

  async function choose(option: VoiceOption) {
    setError(null);
    const result = await setVoice(residentId, option.voice_id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCurrent(option.voice_id);
    setChosen(option.label);
  }

  return (
    <div className="stack">
      <section className="block">
        <h2>Choose a voice</h2>
        {chosen ? (
          <p data-testid="voice-choice">{residentName} chose {chosen}.</p>
        ) : (
          <p>{residentName} can play three voices and pick one.</p>
        )}
        {error ? <p className="note">{error}</p> : null}
        <div className="choice-options" role="group" aria-label="Voices">
          {options.map((option) => {
            const selected = current === option.voice_id;
            return (
              <article key={option.voice_id} className="option" data-voice={option.label}>
                <h3>{option.label}</h3>
                <p>{option.preview_text}</p>
                <div className="speak-actions">
                  <BigButton onClick={() => void play(option)} aria-pressed={playing === option.preview_url}>
                    {`Play ${option.label}`}
                  </BigButton>
                  <BigButton tone="approve" onClick={() => void choose(option)} aria-pressed={selected}>
                    {`Choose ${option.label}`}
                  </BigButton>
                </div>
              </article>
            );
          })}
        </div>
        {playing ? <AudioPlayback src={playing} autoPlay label="Play preview" /> : null}
      </section>
    </div>
  );
}

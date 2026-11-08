"use client";

import { useRef, useState } from "react";
import { Check, Volume2 } from "lucide-react";
import { speak } from "@/lib/api";
import { DeliveredPhoto } from "./DeliveredPhoto";

const PICTURES = [
  { id: "tiles/marcus_coffee", label: "coffee", sentence: "Can I get a double-double from Tim's?" },
  { id: "tiles/marcus_bowling", label: "bowling", sentence: "Can we go bowling on Saturday?" },
  { id: "tiles/marcus_raptors", label: "Raptors", sentence: "Can we watch the Raptors game tonight?" },
];

/**
 * A working taste of the core loop: tap a picture, the sentence changes,
 * hear it in the resident's voice. Real interaction, bounded scope; no
 * approvals or saves happen from the landing page.
 */
export function EntryPreview() {
  const [active, setActive] = useState(PICTURES[0]);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function hear() {
    setPlaying(true);
    const result = await speak({ resident_id: "marcus", text: active.sentence });
    if (result.ok && audioRef.current) {
      audioRef.current.src = result.data.audio_url;
      try {
        await audioRef.current.play();
      } catch {
        /* no audio output available; the visual demo still works */
      }
    }
    setPlaying(false);
  }

  return (
    <figure className="entry-preview" aria-label="Try Speak For Me: tap a picture, then hear the sentence">
      <div className="entry-preview-tiles">
        {PICTURES.map((picture) => (
          <button
            key={picture.id}
            type="button"
            className="entry-preview-tile"
            aria-pressed={active.id === picture.id}
            onClick={() => setActive(picture)}
          >
            <span className="entry-preview-photo">
              <DeliveredPhoto publicId={picture.id} mode="calm" className="tile-img" />
            </span>
            {picture.label}
          </button>
        ))}
      </div>
      <blockquote className="entry-preview-quote" id="entry-preview-transcript">&ldquo;{active.sentence}&rdquo;</blockquote>
      <figcaption className="entry-preview-foot">
        <span className="chip-mono" data-tone="resident">
          <Check size={14} strokeWidth={3} aria-hidden="true" />
          Approved by Marcus
        </span>
        <button
          type="button"
          className="entry-preview-voice entry-preview-play"
          onClick={() => void hear()}
          disabled={playing}
        >
          <Volume2 size={18} aria-hidden="true" />
          {playing ? "Getting his voice…" : "Hear it in Marcus's own voice"}
          <span className="voice-dots" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
        </button>
      </figcaption>
      <audio ref={audioRef} aria-describedby="entry-preview-transcript" />
    </figure>
  );
}

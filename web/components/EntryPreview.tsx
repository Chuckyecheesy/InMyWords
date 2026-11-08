import { Check, Volume2 } from "lucide-react";
import { DeliveredPhoto } from "./DeliveredPhoto";

const PICTURES = [
  { id: "tiles/marcus_coffee", label: "coffee" },
  { id: "tiles/marcus_bowling", label: "bowling" },
  { id: "tiles/marcus_raptors", label: "Raptors" },
];

/** A still of the core loop: pictures → a sentence → the resident approves it. */
export function EntryPreview() {
  return (
    <figure className="entry-preview" aria-label="How Speak For Me works">
      <div className="entry-preview-tiles" aria-hidden="true">
        {PICTURES.map((picture) => (
          <span key={picture.id} className="entry-preview-tile">
            <span className="entry-preview-photo">
              <DeliveredPhoto publicId={picture.id} mode="calm" className="tile-img" />
            </span>
            {picture.label}
          </span>
        ))}
      </div>
      <blockquote className="entry-preview-quote">&ldquo;Can I get a double-double from Tim&apos;s?&rdquo;</blockquote>
      <figcaption className="entry-preview-foot">
        <span className="chip-mono" data-tone="resident">
          <Check size={14} strokeWidth={3} aria-hidden="true" />
          Approved by Marcus
        </span>
        <span className="entry-preview-voice">
          <Volume2 size={18} aria-hidden="true" />
          Spoken in Marcus&apos;s own voice
          <span className="voice-dots" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
        </span>
      </figcaption>
    </figure>
  );
}

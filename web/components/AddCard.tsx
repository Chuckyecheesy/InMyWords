"use client";

import { useState } from "react";
import { addTile, getResidentFresh } from "@/lib/api";
import type { Tile } from "@/lib/types";
import { DeliveredPhoto } from "./DeliveredPhoto";

const PHOTO_POOL = [
  "tiles/marcus_coffee", "tiles/marcus_tea", "tiles/marcus_bowling", "tiles/marcus_raptors",
  "tiles/marcus_park", "tiles/marcus_music", "tiles/marcus_bus", "tiles/marcus_quiet",
  "tiles/marcus_movie", "tiles/marcus_later", "tiles/dana_garden", "tiles/dana_herbs",
  "tiles/dana_groceries", "tiles/dana_walk", "tiles/dana_tv", "tiles/dana_tea",
];

export function AddCard({
  residentId,
  onCancel,
  onSaved,
}: {
  residentId: string;
  onCancel: () => void;
  onSaved: (tiles: Tile[], label: string) => void;
}) {
  const [step, setStep] = useState<"label" | "photo" | "preview">("label");
  const [label, setLabel] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (!label.trim() || !photo || busy) return;
    setBusy(true);
    setStatus(saved ? "Refreshing your pictures…" : "Saving your card…");
    if (!saved) {
      const result = await addTile({
        resident_id: residentId,
        label: label.trim(),
        cloudinary_id: photo,
        category: "my cards",
      });
      if (!result.ok || !result.data.ok || !result.data.tile) {
        setBusy(false);
          setStatus(result.ok ? "The app could not confirm the card was saved. Please try again." : result.error);
        return;
      }
      setSaved(true);
    }
    const fresh = await getResidentFresh(residentId);
    setBusy(false);
    if (!fresh) {
      setStatus("Your card was saved, but the pictures could not refresh. Try refreshing again.");
      return;
    }
    onSaved(fresh.tiles, label.trim());
  }

  return (
    <section className="card card-pad setup-card" aria-label="Add a card">
      {status ? <p className="note" role="status">{status}</p> : null}
      {step === "label" ? (
        <>
          <p className="lead">What should the card say?</p>
          <input
            className="card-label-input"
            value={label}
            autoFocus
            maxLength={24}
            aria-label="Card label"
            onChange={(event) => setLabel(event.target.value)}
          />
          <div className="setup-actions">
            <button type="button" className="btn" data-variant="primary" data-size="xl" disabled={!label.trim()} onClick={() => setStep("photo")}>
              Next: pick a photo
            </button>
            <button type="button" className="btn" data-variant="ghost" data-size="lg" onClick={onCancel}>Cancel</button>
          </div>
        </>
      ) : null}
      {step === "photo" ? (
        <>
          <p className="lead">Pick a photo for &ldquo;{label}&rdquo;.</p>
          <div className="photo-pool">
            {PHOTO_POOL.map((id) => (
              <button
                key={id}
                type="button"
                className="photo-pool-item"
                aria-pressed={photo === id}
                aria-label={id.split("/").pop()?.replace(/_/g, " ")}
                onClick={() => setPhoto(id)}
              >
                <DeliveredPhoto publicId={id} mode="calm" className="tile-img" />
              </button>
            ))}
          </div>
          <div className="setup-actions">
            <button type="button" className="btn" data-variant="primary" data-size="xl" disabled={!photo} onClick={() => setStep("preview")}>
              Next: preview
            </button>
            <button type="button" className="btn" data-variant="ghost" data-size="lg" onClick={() => setStep("label")}>Back</button>
            <button type="button" className="btn" data-variant="ghost" data-size="lg" onClick={onCancel}>Cancel</button>
          </div>
        </>
      ) : null}
      {step === "preview" && photo ? (
        <>
          <p className="lead">Here is your card. Save it?</p>
          <div className="tile tile-button card-preview" aria-hidden="true">
            <span className="entry-preview-photo">
              <DeliveredPhoto publicId={photo} mode="calm" className="tile-img" />
            </span>
            <span className="tile-label">{label}</span>
          </div>
          <div className="setup-actions">
            <button type="button" className="btn" data-variant="primary" data-size="xl" disabled={busy} onClick={() => void save()}>
              {saved ? "Refresh pictures" : "Save my card"}
            </button>
            {!saved ? <button type="button" className="btn" data-variant="ghost" data-size="lg" disabled={busy} onClick={() => setStep("photo")}>Back</button> : null}
            <button type="button" className="btn" data-variant="ghost" data-size="lg" disabled={busy} onClick={onCancel}>
              {saved ? "Close" : "Cancel"}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { ArchiveRestore, ImagePlus, Undo2 } from "lucide-react";
import { addTile, getResidentFresh, setTileArchived } from "@/lib/api";
import type { Resident, Tile } from "@/lib/types";
import { Callout } from "./ui";
import { DeliveredPhoto } from "./DeliveredPhoto";
import { TileButton } from "./shared";

/** Photos the resident can pick for a new card without an upload. */
const PHOTO_POOL = [
  "tiles/marcus_coffee", "tiles/marcus_tea", "tiles/marcus_bowling", "tiles/marcus_raptors",
  "tiles/marcus_park", "tiles/marcus_music", "tiles/marcus_bus", "tiles/marcus_quiet",
  "tiles/marcus_movie", "tiles/marcus_later", "tiles/dana_garden", "tiles/dana_herbs",
  "tiles/dana_groceries", "tiles/dana_walk", "tiles/dana_tv", "tiles/dana_tea",
];

type Step = "list" | "label" | "photo" | "preview";

export function MyCards({ resident }: { resident: Resident }) {
  const [tiles, setTiles] = useState<Tile[]>(resident.tiles);
  const [step, setStep] = useState<Step>("list");
  const [label, setLabel] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [lastArchived, setLastArchived] = useState<Tile | null>(null);

  async function refresh() {
    const fresh = await getResidentFresh(resident.id);
    if (fresh) setTiles(fresh.tiles);
  }

  async function save() {
    if (!label.trim() || !photo) return;
    setStatus("Saving your card…");
    const result = await addTile({
      resident_id: resident.id,
      label: label.trim(),
      cloudinary_id: photo,
      category: "my cards",
    });
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    await refresh();
    setStatus(`"${label.trim()}" is on your grid now.`);
    setLabel("");
    setPhoto(null);
    setStep("list");
  }

  async function archive(tile: Tile) {
    const result = await setTileArchived(tile.id, resident.id, true);
    if (result.ok) {
      setLastArchived(tile);
      setStatus(`"${tile.label}" is hidden. You can bring it back any time.`);
      await refresh();
    }
  }

  async function unarchive() {
    if (!lastArchived) return;
    await setTileArchived(lastArchived.id, resident.id, false);
    setStatus(`"${lastArchived.label}" is back.`);
    setLastArchived(null);
    await refresh();
  }

  return (
    <div className="stack calibrate-page">
      <header className="page-head">
        <p className="eyebrow">My cards</p>
        <h1>My picture cards</h1>
        <p className="lead">Make a card for anything you want to say. Hiding a card never deletes it.</p>
      </header>

      {status ? (
        <Callout tone="success" role="status">
          <span className="row" style={{ gap: 12, alignItems: "center" }}>
            {status}
            {lastArchived ? (
              <button type="button" className="btn" data-variant="soft" data-size="lg" onClick={() => void unarchive()}>
                <Undo2 size={18} aria-hidden="true" /> Undo
              </button>
            ) : null}
          </span>
        </Callout>
      ) : null}

      {step === "list" ? (
        <>
          <div className="setup-actions" style={{ justifyContent: "flex-start" }}>
            <button type="button" className="btn" data-variant="primary" data-size="xl" onClick={() => setStep("label")}>
              <ImagePlus size={24} aria-hidden="true" />
              Add a card
            </button>
            <Link href={`/resident/${resident.id}/speak`} className="btn" data-variant="soft" data-size="xl">
              Back to my tiles
            </Link>
          </div>
          <section className="card card-pad" aria-label="My cards">
            <div className="tile-grid">
              {tiles.map((tile) => (
                <div key={tile.id} className="card-manage">
                  <TileButton tile={tile} />
                  <button
                    type="button"
                    className="btn"
                    data-variant="ghost"
                    data-size="sm"
                    onClick={() => void archive(tile)}
                  >
                    <ArchiveRestore size={16} aria-hidden="true" /> Hide
                  </button>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {step === "label" ? (
        <section className="card card-pad setup-card" aria-label="Name your card">
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
            <button type="button" className="btn" data-variant="ghost" data-size="lg" onClick={() => setStep("list")}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      {step === "photo" ? (
        <section className="card card-pad" aria-label="Pick a photo">
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
            <button type="button" className="btn" data-variant="ghost" data-size="lg" onClick={() => setStep("label")}>
              Back
            </button>
          </div>
        </section>
      ) : null}

      {step === "preview" && photo ? (
        <section className="card card-pad setup-card" aria-label="Preview your card">
          <p className="lead">Here is your card. Save it?</p>
          <div className="tile tile-button card-preview" aria-hidden="true">
            <span className="entry-preview-photo">
              <DeliveredPhoto publicId={photo} mode="calm" className="tile-img" />
            </span>
            <span className="tile-label">{label}</span>
          </div>
          <div className="setup-actions">
            <button type="button" className="btn" data-variant="primary" data-size="xl" onClick={() => void save()}>
              Save my card
            </button>
            <button type="button" className="btn" data-variant="ghost" data-size="lg" onClick={() => setStep("photo")}>
              Back
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

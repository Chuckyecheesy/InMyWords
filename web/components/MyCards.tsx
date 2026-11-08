"use client";

import { useState } from "react";
import Link from "next/link";
import { ArchiveRestore, Undo2 } from "lucide-react";
import { getResidentFresh, setTileArchived } from "@/lib/api";
import type { Resident, Tile } from "@/lib/types";
import { Callout } from "./ui";
import { TileButton } from "./shared";

export function MyCards({ resident }: { resident: Resident }) {
  const [tiles, setTiles] = useState<Tile[]>(resident.tiles);
  const [status, setStatus] = useState<string | null>(null);
  const [lastArchived, setLastArchived] = useState<Tile | null>(null);

  async function refresh() {
    const fresh = await getResidentFresh(resident.id);
    if (fresh) setTiles(fresh.tiles);
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
        <p className="lead">Hide cards here, or add a card from Say my words. Hiding a card never deletes it.</p>
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

      <div className="setup-actions" style={{ justifyContent: "flex-start" }}>
        <Link href={`/resident/${resident.id}/speak/words`} className="btn" data-variant="soft" data-size="xl">
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
    </div>
  );
}

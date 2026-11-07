import { notFound } from "next/navigation";
import { WordTile } from "@/components/WordTile";
import { getResident } from "@/lib/api";
import { categoryLabel } from "@/lib/format";
import type { Tile } from "@/lib/types";

const CATEGORY_ORDER = [
  "drinks",
  "activities",
  "people",
  "places",
  "feelings",
  "errands",
  "words",
];

function groupTiles(tiles: Tile[]): [string, Tile[]][] {
  const groups = new Map<string, Tile[]>();
  for (const tile of tiles) {
    const list = groups.get(tile.category) ?? [];
    list.push(tile);
    groups.set(tile.category, list);
  }
  const ordered = [...groups.keys()].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return ordered.map((category) => [category, groups.get(category) ?? []]);
}

export default async function ResidentHomePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();

  return (
    <div className="stack">
      <section className="sentence" aria-label="Sentence">
        <h2>Sentence</h2>
        <p>No sentence yet.</p>
      </section>
      {groupTiles(resident.data.tiles).map(([category, tiles]) => (
        <section key={category} className="block">
          <h2>{categoryLabel(category)}</h2>
          <div className="tile-grid">
            {tiles.map((tile) => (
              <WordTile key={tile.id} tile={tile} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

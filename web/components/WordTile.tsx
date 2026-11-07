import Image from "next/image";
import { tileImageUrl } from "@/lib/cloudinary";
import type { Tile } from "@/lib/types";

export function WordTile({ tile }: { tile: Tile }) {
  const calm = tile.cloudinary_id ? tileImageUrl(tile.cloudinary_id, "calm") : null;
  const contrast = tile.cloudinary_id ? tileImageUrl(tile.cloudinary_id, "contrast") : null;

  return (
    <figure className="tile">
      <div className="tile-face">
        {calm && contrast ? (
          <>
            <Image className="tile-img tile-img-calm" src={calm} alt="" fill sizes="180px" />
            <Image className="tile-img tile-img-contrast" src={contrast} alt="" fill sizes="180px" />
          </>
        ) : (
          <span className="tile-letter">{tile.label}</span>
        )}
      </div>
      {calm ? <figcaption className="tile-label">{tile.label}</figcaption> : null}
    </figure>
  );
}

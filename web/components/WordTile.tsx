import { DeliveredPhoto } from "@/components/DeliveredPhoto";
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
            <DeliveredPhoto publicId={tile.cloudinary_id!} mode="calm" className="tile-img tile-img-calm" />
            <DeliveredPhoto publicId={tile.cloudinary_id!} mode="contrast" className="tile-img tile-img-contrast" />
          </>
        ) : (
          <span className="tile-letter">{tile.label}</span>
        )}
      </div>
      {calm ? <figcaption className="tile-label">{tile.label}</figcaption> : null}
    </figure>
  );
}

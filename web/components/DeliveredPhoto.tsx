"use client";

import { useState } from "react";
import { photoSources } from "@/lib/cloudinary";

/**
 * Show the photo saved with the app. Cloudinary is only asked if that file
 * is missing, so a resident grid does not open with a burst of failed
 * image requests.
 */
export function DeliveredPhoto({
  publicId,
  mode,
  className,
}: {
  publicId: string;
  mode: "calm" | "contrast" | "story";
  className: string;
}) {
  return (
    <PhotoAttempt
      key={`${publicId}:${mode}`}
      publicId={publicId}
      mode={mode}
      className={className}
    />
  );
}

function PhotoAttempt({
  publicId,
  mode,
  className,
}: {
  publicId: string;
  mode: "calm" | "contrast" | "story";
  className: string;
}) {
  const sources = photoSources(publicId, mode);
  const [index, setIndex] = useState(0);
  const src = sources[index];
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => {
        setIndex((current) => (current + 1 < sources.length ? current + 1 : current));
      }}
    />
  );
}

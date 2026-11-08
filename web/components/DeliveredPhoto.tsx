"use client";

import { useState } from "react";
import { demoPhotoUrl, storyImageUrl, tileImageUrl } from "@/lib/cloudinary";

/**
 * Ask Cloudinary for the transformed photo. If that cloud has no such
 * image, show the file saved with the app.
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
  const remote = mode === "story" ? storyImageUrl(publicId) : tileImageUrl(publicId, mode);
  const local = demoPhotoUrl(publicId);
  const [src, setSrc] = useState(remote || local);
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={src}
      alt=""
      onError={() => {
        if (local && src !== local) setSrc(local);
      }}
    />
  );
}

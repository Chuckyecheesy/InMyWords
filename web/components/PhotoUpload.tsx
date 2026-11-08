"use client";

import { useEffect, useState } from "react";
import { getUploadConfig, savePhoto, type UploadConfig } from "@/lib/api";
import type { Tile } from "@/lib/types";
import { WordTile } from "./WordTile";

export function PhotoUpload({
  residentId,
  initialConfig = null,
  initialError = null,
}: {
  residentId: string;
  initialConfig?: UploadConfig | null;
  initialError?: string | null;
}) {
  const [config, setConfig] = useState<UploadConfig | null>(initialConfig);
  const [configError, setConfigError] = useState<string | null>(initialError);
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tile, setTile] = useState<Tile | null>(null);
  // Cloudinary id of the photo already uploaded for this file, so a label fix
  // or "Save anyway" doesn't upload it again.
  const [uploadedId, setUploadedId] = useState<string | null>(null);
  const [review, setReview] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getUploadConfig().then((result) => {
      if (cancelled) return;
      if (result.ok) setConfig(result.data);
      else setConfigError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function upload(): Promise<string | null> {
    if (uploadedId) return uploadedId;
    if (!config || !file) return null;
    setStatus("Uploading the photo.");
    const body = new FormData();
    body.append("file", file);
    body.append("upload_preset", config.upload_preset);
    const uploaded = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloud_name)}/image/upload`,
      { method: "POST", body },
    );
    const payload = (await uploaded.json()) as {
      public_id?: string;
      error?: { message?: string };
    };
    if (!uploaded.ok || !payload.public_id) {
      setStatus(payload.error?.message ?? "Cloudinary did not accept the photo.");
      return null;
    }
    setUploadedId(payload.public_id);
    return payload.public_id;
  }

  async function save(confirmed: boolean) {
    if (!config || !file || !label.trim() || busy) return;
    setBusy(true);
    setReview(null);
    try {
      const publicId = await upload();
      if (!publicId) return;
      setStatus("Checking the photo.");
      const saved = await savePhoto({
        resident_id: residentId,
        public_id: publicId,
        label: label.trim(),
        confirmed,
      });
      if (!saved.ok) {
        setStatus(saved.error);
        return;
      }
      const data = saved.data;
      if (data.status === "needs_review") {
        setReview(data.reasons ?? ["Please check this photo before saving."]);
        setStatus("Not saved yet. Look at the photo, then choose.");
        return;
      }
      if (data.status === "saved_offline") {
        setStatus(data.reason ?? "Saved the photo, but it isn't a tile yet.");
        return;
      }
      const stored = data.tile;
      setTile({
        id: String(stored?.id ?? data.cloudinary_id),
        label: stored?.label ?? label.trim(),
        category: stored?.category ?? "photo",
        cloudinary_id: stored?.cloudinary_id ?? data.cloudinary_id,
      });
      const parts = [
        data.replaced
          ? `Saved. The "${stored?.label}" tile now uses this photo.`
          : `Saved as a new "${stored?.label}" tile.`,
      ];
      if (data.checked === false) parts.push("The photo check was not available, so your label was used.");
      setStatus(parts.join(" "));
      setUploadedId(null);
    } catch {
      setStatus("The photo could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(false);
  }

  const ready = Boolean(config) && !busy;

  return (
    <form className="stack" onSubmit={onSubmit}>
      {configError ? <p className="banner">{configError}</p> : null}
      <label className="block" htmlFor="photo-label">
        What is this a picture of?
        <input
          id="photo-label"
          className="field"
          value={label}
          onChange={(event) => {
            setLabel(event.target.value);
            setReview(null);
          }}
          autoComplete="off"
        />
      </label>
      <label className="file-picker">
        {file ? file.name : "Choose a photo"}
        <input
          type="file"
          accept="image/*"
          disabled={!ready}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setUploadedId(null);
            setReview(null);
            setTile(null);
          }}
        />
      </label>
      <button className="save-photo" type="submit" disabled={!ready || !file || !label.trim()}>
        {busy ? "Saving" : "Save photo"}
      </button>
      {status ? <p role="status">{status}</p> : null}
      {review ? (
        <div className="block photo-review" role="alert">
          <ul>
            {review.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <div className="photo-review-actions">
            <button type="button" className="save-photo" disabled={busy} onClick={() => void save(true)}>
              Save anyway
            </button>
            <button
              type="button"
              className="file-picker"
              disabled={busy}
              onClick={() => {
                setReview(null);
                setStatus("Change the label or choose another photo, then save.");
                document.getElementById("photo-label")?.focus();
              }}
            >
              Fix the label
            </button>
          </div>
        </div>
      ) : null}
      {tile ? (
        <div className="photo-preview">
          <WordTile tile={tile} />
        </div>
      ) : null}
    </form>
  );
}

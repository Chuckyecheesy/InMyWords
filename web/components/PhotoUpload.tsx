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

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config || !file || !label.trim() || busy) return;
    setBusy(true);
    setStatus("Uploading the photo.");
    try {
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
        return;
      }
      const saved = await savePhoto({
        resident_id: residentId,
        public_id: payload.public_id,
        label: label.trim(),
      });
      if (!saved.ok) {
        setStatus(saved.error);
        return;
      }
      setTile({
        id: saved.data.cloudinary_id,
        label: label.trim(),
        category: "photo",
        cloudinary_id: saved.data.cloudinary_id,
      });
      setStatus("Saved. This photo uses the same tile crop as the others.");
    } catch {
      setStatus("The photo could not be uploaded.");
    } finally {
      setBusy(false);
    }
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
          onChange={(event) => setLabel(event.target.value)}
          autoComplete="off"
        />
      </label>
      <label className="file-picker">
        {file ? file.name : "Choose a photo"}
        <input
          type="file"
          accept="image/*"
          disabled={!ready}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>
      <button className="save-photo" type="submit" disabled={!ready || !file || !label.trim()}>
        {busy ? "Saving" : "Save photo"}
      </button>
      {status ? <p role="status">{status}</p> : null}
      {tile ? (
        <div className="photo-preview">
          <WordTile tile={tile} />
        </div>
      ) : null}
    </form>
  );
}

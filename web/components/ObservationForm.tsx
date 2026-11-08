"use client";

import { useState } from "react";
import { Check, Send, X } from "lucide-react";
import { addObservation } from "@/lib/api";
import { DEMO_STAFF } from "@/lib/mock";
import type { Highlight } from "@/lib/types";
import { Fact } from "./ui";

/** Adds a staff note. It sits beside, never over, the resident's words. */
export function ObservationForm({ residentId, name }: { residentId: string; name: string }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Highlight[]>([]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = note.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    const result = await addObservation({ resident_id: residentId, staff_id: DEMO_STAFF.id, note: text });
    setBusy(false);
    if (!result.ok) {
      setError("Couldn't save the note. It's still in the box, try again.");
      return;
    }
    setAdded((current) => [
      { text, source: "staff", date: new Date().toISOString().slice(0, 10), author: DEMO_STAFF.name },
      ...current,
    ]);
    setNote("");
  }

  return (
    <div className="stack-sm">
      {added.length > 0 ? (
        <ul style={{ listStyle: "none" }}>
          {added.map((item) => (
            <Fact key={item.text} item={item} name={name} />
          ))}
        </ul>
      ) : null}
      <form className="note-form" onSubmit={submit}>
        <label className="field-label" htmlFor="obs">
          Add an observation
          <textarea
            id="obs"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={`What did you notice about ${name} today?`}
          />
        </label>
        <p className="muted" style={{ fontSize: 14 }}>
          Saved as your staff note with today&apos;s date. It never changes anything in {name}&apos;s own words.
        </p>
        {error ? (
          <div className="callout" data-tone="error" role="alert">
            <X size={18} aria-hidden="true" />
            <div className="callout-body">{error}</div>
          </div>
        ) : null}
        {added.length > 0 && !error ? (
          <p className="review-note" role="status">
            <Check size={16} aria-hidden="true" /> Note saved.
          </p>
        ) : null}
        <div>
          <button type="submit" className="btn" data-variant="primary" disabled={!note.trim() || busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
            Save note
          </button>
        </div>
      </form>
    </div>
  );
}

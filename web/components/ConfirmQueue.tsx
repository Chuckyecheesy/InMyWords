"use client";

import { useState } from "react";
import { AlertTriangle, Eye } from "lucide-react";
import { confirmMemory, speak } from "@/lib/api";
import { sourceChip } from "@/lib/format";
import type { PendingMemory } from "@/lib/types";
import { SourceChip } from "./SourceChip";
import { BigButton } from "./shared";

/**
 * "Pattern noticed, confirm?" queue. Inferred and imported facts stay labelled
 * as such until the resident answers yes or no. Staff never answer for them.
 */
export function ConfirmQueue({
  residentName,
  residentId = residentName.toLowerCase(),
  memories,
}: {
  residentName: string;
  residentId?: string;
  memories: PendingMemory[];
}) {
  const [answered, setAnswered] = useState<Record<string, "yes" | "no">>({});
  const [failed, setFailed] = useState<string | null>(null);
  // An answer is held here until the resident taps Next. Undo drops it, so
  // nothing is saved to memory that they could still change their mind on.
  const [held, setHeld] = useState<Record<string, "yes" | "no">>({});

  function hold(id: string, value: "yes" | "no") {
    setFailed(null);
    setHeld((prev) => ({ ...prev, [id]: value }));
  }

  function undo(id: string) {
    setFailed(null);
    setHeld(({ [id]: _dropped, ...rest }) => rest);
  }

  async function save(id: string) {
    const value = held[id];
    if (!value) return;
    setFailed(null);
    const result = await confirmMemory(id, value, residentId);
    if (!result.ok) {
      setFailed(id);
      return;
    }
    setAnswered((prev) => ({ ...prev, [id]: value }));
  }

  // Long-press any button to hear its label.
  function hear(label: string) {
    void speak({ resident_id: residentId, text: label });
  }

  const waiting = memories.filter((memory) => !answered[memory.id]);
  if (waiting.length === 0) {
    return (
      <div className="empty">
        <span className="empty-icon" aria-hidden="true">
          <Eye size={30} />
        </span>
        <h2>All done</h2>
        <p>Nothing is waiting for {residentName} to confirm.</p>
      </div>
    );
  }
  const later = waiting.length - 1;

  return (
    <>
      {waiting.slice(0, 1).map((memory) => {  // one question at a time
        const chip = sourceChip(memory.source, residentName, memory.source_date);
        const seen = memory.times_seen && memory.times_seen > 1 ? memory.times_seen : null;
        return (
          <article key={memory.id} className="confirm-card">
            <p className="confirm-statement">{memory.content}</p>
            <div className="row">
              <SourceChip tone={chip.tone} label={chip.label} />
              {seen ? <span className="badge" data-tone="neutral">Seen {seen} times</span> : null}
            </div>
            {memory.update_reason ? (
              <p className="callout" data-tone="info" role="note">
                <AlertTriangle size={20} aria-hidden="true" />
                <span>May have changed. {memory.update_reason}.</span>
              </p>
            ) : null}
            {held[memory.id] ? (
              <>
                <p className="confirm-q">
                  You said {held[memory.id] === "yes" ? "Yes" : "No"}.
                </p>
                <div className="confirm-actions">
                  <BigButton tone="neutral" onLongPress={hear} onClick={() => undo(memory.id)}>
                    Undo
                  </BigButton>
                  <BigButton tone="approve" onLongPress={hear} onClick={() => save(memory.id)}>
                    Next
                  </BigButton>
                </div>
              </>
            ) : (
              <>
                <h2 className="confirm-q">Is this still true for {residentName}?</h2>
                <div className="confirm-actions">
                  <BigButton tone="approve" onLongPress={hear} onClick={() => hold(memory.id, "yes")}>
                    Yes
                  </BigButton>
                  <BigButton tone="reject" onLongPress={hear} onClick={() => hold(memory.id, "no")}>
                    No
                  </BigButton>
                </div>
              </>
            )}
            {failed === memory.id ? (
              <p className="callout" data-tone="error" role="alert">That did not save. Try again.</p>
            ) : null}
          </article>
        );
      })}
      {later > 0 ? (
        <p className="note">{later} more after this one.</p>
      ) : null}
    </>
  );
}

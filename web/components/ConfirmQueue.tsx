"use client";

import { useState } from "react";
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
    return <p>Nothing is waiting for {residentName} to confirm.</p>;
  }
  const later = waiting.length - 1;

  return (
    <>
      {waiting.slice(0, 1).map((memory) => {  // one question at a time
        const chip = sourceChip(memory.source, residentName, memory.source_date);
        const seen = memory.times_seen && memory.times_seen > 1 ? memory.times_seen : null;
        return (
          <article key={memory.id} className="fact">
            <p>{memory.content}</p>
            <SourceChip tone={chip.tone} label={chip.label} />
            {seen ? <p className="note">Seen {seen} times.</p> : null}
            {memory.update_reason ? (
              <p className="note" role="note">
                ⚠️ May have changed. {memory.update_reason}.
              </p>
            ) : null}
            {held[memory.id] ? (
              <>
                <p className="note">
                  You said {held[memory.id] === "yes" ? "Yes" : "No"}.
                </p>
                <div className="actions">
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
                <p className="note">Is this still true for {residentName}?</p>
                <div className="actions">
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
              <p className="note">That did not save. Try again.</p>
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

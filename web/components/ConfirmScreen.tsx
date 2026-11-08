"use client";

import { useRef, useState } from "react";
import { confirmMemory, speak } from "@/lib/api";
import { tileImageUrl } from "@/lib/cloudinary";
import { sourceChip } from "@/lib/format";
import type { PendingMemory } from "@/lib/types";
import { SourceChip } from "./SourceChip";
import { BigButton } from "./shared";

export function ConfirmScreen({
  residentId,
  residentName,
  memories,
}: {
  residentId: string;
  residentName: string;
  memories: PendingMemory[];
}) {
  const [answers, setAnswers] = useState<Record<string, "yes" | "no">>({});
  const [error, setError] = useState<string | null>(null);

  async function hear(label: string) {
    const spoken = await speak({ resident_id: residentId, text: label });
    if (!spoken.ok) setError(spoken.error);
  }

  async function answer(memory: PendingMemory, value: "yes" | "no") {
    setError(null);
    const result = await confirmMemory(memory.id, value, residentId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAnswers((current) => ({ ...current, [memory.id]: value }));
  }

  return (
    <div className="stack">
      <section className="block">
        <h2>Pattern noticed, confirm?</h2>
        {memories.length === 0 ? (
          <p>Nothing is waiting for {residentName} to confirm.</p>
        ) : (
          memories.map((memory) => {
            const chip = sourceChip(memory.source, residentName, memory.source_date);
            const picked = answers[memory.id];
            return (
              <article key={memory.id} className="fact" data-memory={memory.id}>
                <p>{memory.content}</p>
                <SourceChip tone={chip.tone} label={chip.label} />
                {picked ? (
                  <>
                    <p data-testid={`confirm-${memory.id}`}>
                      {picked === "yes"
                        ? `In ${residentName}'s words.`
                        : `${residentName} said no.`}
                    </p>
                    <BigButton
                      onLongPress={hear}
                      onClick={() =>
                        setAnswers((current) => {
                          const next = { ...current };
                          delete next[memory.id];
                          return next;
                        })
                      }
                    >
                      Undo
                    </BigButton>
                  </>
                ) : (
                  <div className="choice-options" role="group" aria-label="Yes or no">
                    <AnswerTile
                      residentId={residentId}
                      label="Yes"
                      onChoose={() => void answer(memory, "yes")}
                      onLongPress={() => void hear("Yes")}
                    />
                    <AnswerTile
                      residentId={residentId}
                      label="No"
                      onChoose={() => void answer(memory, "no")}
                      onLongPress={() => void hear("No")}
                    />
                  </div>
                )}
              </article>
            );
          })
        )}
        {error ? <p className="note">{error}</p> : null}
      </section>
    </div>
  );
}

function AnswerTile({
  residentId,
  label,
  onChoose,
  onLongPress,
}: {
  residentId: string;
  label: "Yes" | "No";
  onChoose: () => void;
  onLongPress: () => void;
}) {
  const leaf = label.toLowerCase();
  const photo = `tiles/${residentId.toLowerCase()}_${leaf}`;
  const calm = tileImageUrl(photo, "calm");
  const contrast = tileImageUrl(photo, "contrast");
  const held = useRef(false);
  return (
    <button
      type="button"
      className="choice-button"
      aria-label={label}
      data-choice={label}
      onClick={() => {
        if (held.current) {
          held.current = false;
          return;
        }
        onChoose();
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 && event.pointerType === "mouse") return;
        const target = event.currentTarget;
        held.current = false;
        const timer = window.setTimeout(() => {
          held.current = true;
          onLongPress();
        }, 600);
        const stop = () => {
          window.clearTimeout(timer);
          target.removeEventListener("pointerup", stop);
          target.removeEventListener("pointerleave", stop);
          target.removeEventListener("pointercancel", stop);
        };
        target.addEventListener("pointerup", stop);
        target.addEventListener("pointerleave", stop);
        target.addEventListener("pointercancel", stop);
      }}
    >
      {calm && contrast ? (
        <picture>
          <img className="choice-img choice-img-calm" src={calm} alt="" />
          <img className="choice-img choice-img-contrast" src={contrast} alt="" />
        </picture>
      ) : null}
      <span className="choice-label">{label}</span>
    </button>
  );
}

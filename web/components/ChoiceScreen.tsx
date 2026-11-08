"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createChoice, decideChoice, planActions, speak, type ActionPlan } from "@/lib/api";
import { choicePrompt, NOT_DECIDED_LABEL, NOT_DECIDED_VALUE } from "@/lib/choice-prompts";
import { DeliveredPhoto } from "@/components/DeliveredPhoto";
import { tileImageUrl } from "@/lib/cloudinary";
import { choiceStanding, consequence, money } from "@/lib/format";
import type { ChoiceOption, ChoiceResult } from "@/lib/types";
import { ApprovalCard } from "./ApprovalCard";
import { BigButton } from "./shared";

const LONG_PRESS_MS = 600;

function phraseOf(text: string): string {
  const split = text.indexOf(" Costs ");
  return split === -1 ? text : text.slice(0, split);
}

export function ChoiceScreen({
  residentId,
  residentName,
}: {
  residentId: string;
  residentName: string;
}) {
  const prompt = choicePrompt(residentId);
  const [choice, setChoice] = useState<ChoiceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(prompt));
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [status, setStatus] = useState<"chosen" | "not_yet_decided" | null>(null);
  const [plan, setPlan] = useState<ActionPlan | null>(null);
  const pressed = useRef(false);

  useEffect(() => {
    if (status !== "chosen" || !chosen) return;
    let cancel = false;
    planActions({ resident_id: residentId, goal: chosen }).then((result) => {
      if (cancel) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPlan(result.data);
    });
    return () => {
      cancel = true;
    };
  }, [status, chosen, residentId]);

  useEffect(() => {
    if (!prompt) return;
    let cancel = false;
    createChoice({
      resident_id: residentId,
      question: prompt.question,
      options: prompt.options,
    }).then((result) => {
      if (cancel) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setChoice(result.data);
    });
    return () => {
      cancel = true;
    };
  }, [prompt, residentId]);

  async function hear(label: string) {
    const spoken = await speak({ resident_id: residentId, text: label });
    if (!spoken.ok) setError(spoken.error);
  }

  function hold(event: PointerEvent<HTMLButtonElement>, label: string) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const target = event.currentTarget;
    pressed.current = false;
    const timer = window.setTimeout(() => {
      pressed.current = true;
      void hear(label);
    }, LONG_PRESS_MS);
    const stop = () => {
      window.clearTimeout(timer);
      target.removeEventListener("pointerup", stop);
      target.removeEventListener("pointerleave", stop);
      target.removeEventListener("pointercancel", stop);
    };
    target.addEventListener("pointerup", stop);
    target.addEventListener("pointerleave", stop);
    target.addEventListener("pointercancel", stop);
  }

  async function pick(option: ChoiceOption) {
    if (!choice || busy || pressed.current) return;
    setBusy(true);
    setError(null);
    const value = option.label.toLowerCase() === NOT_DECIDED_LABEL ? NOT_DECIDED_VALUE : option.label;
    const result = await decideChoice(String(choice.id), value);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const decided = result.data.status === "not_yet_decided" || value === NOT_DECIDED_VALUE;
    setStatus(decided ? "not_yet_decided" : "chosen");
    setChosen(decided ? null : option.label);
  }

  if (!prompt) return <p>No choice is open.</p>;

  return (
    <div className="stack">
      <section className="block">
        <h2>{choice?.question ?? prompt.question}</h2>
        {choice?.weekly_budget != null ? (
          <p>Weekly budget {money(choice.weekly_budget)}.</p>
        ) : null}
        {loading ? <p role="status">Thinking…</p> : null}
        {error ? <p className="note">{error}</p> : null}
        <div className="choice-options" role="group" aria-label="Choices">
          {(choice?.options ?? []).map((option) => {
            const calm = option.photo ? tileImageUrl(option.photo, "calm") : null;
            const contrast = option.photo ? tileImageUrl(option.photo, "contrast") : null;
            const selected = chosen === option.label || (status === "not_yet_decided" && option.label.toLowerCase() === NOT_DECIDED_LABEL);
            return (
              <button
                key={option.label}
                type="button"
                className={`choice-button${selected ? " is-selected" : ""}`}
                aria-label={option.label}
                aria-pressed={selected}
                data-choice={option.label}
                disabled={busy || loading}
                onPointerDown={(event) => hold(event, option.label)}
                onClick={() => {
                  if (pressed.current) {
                    pressed.current = false;
                    return;
                  }
                  void pick(option);
                }}
              >
                {calm && contrast ? (
                  <picture>
                    <DeliveredPhoto publicId={option.photo ?? ""} mode="calm" className="choice-img choice-img-calm" />
                    <DeliveredPhoto publicId={option.photo ?? ""} mode="contrast" className="choice-img choice-img-contrast" />
                  </picture>
                ) : (
                  <span className="choice-letter" aria-hidden="true">
                    {option.label.slice(0, 1)}
                  </span>
                )}
                <span className="choice-label">{option.label}</span>
                {option.consequence ? <span className="note">{phraseOf(option.consequence)}</span> : null}
                <span className="note">{consequence(option.cost, choice?.weekly_budget ?? null)}</span>
              </button>
            );
          })}
        </div>
        {status ? (
          <>
            <p className="eyebrow" data-testid="choice-standing">
              {choiceStanding(status, residentName, chosen)}
            </p>
            <BigButton
              onLongPress={hear}
              onClick={() => {
                setStatus(null);
                setChosen(null);
                setPlan(null);
              }}
            >
              Undo
            </BigButton>
          </>
        ) : null}
      </section>
      {plan ? <ApprovalCard residentId={residentId} plan={plan} /> : null}
    </div>
  );
}

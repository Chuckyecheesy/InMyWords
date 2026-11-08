"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createChoice, decideChoice, planActions, speak, type ActionPlan, type AgentNote } from "@/lib/api";
import { choicePrompt, NOT_DECIDED_LABEL, NOT_DECIDED_VALUE } from "@/lib/choice-prompts";
import { DeliveredPhoto } from "@/components/DeliveredPhoto";
import { Check, Clock, RotateCcw, Volume2, Wallet } from "lucide-react";
import { choiceStanding, consequence, money } from "@/lib/format";
import type { ChoiceOption, ChoiceResult } from "@/lib/types";
import { ApprovalCard } from "./ApprovalCard";
import { OptionArt } from "./ChapterArt";
import { ThinkingDots } from "./ui";

const LONG_PRESS_MS = 600;

function AgentShowcase({ agents }: { agents: AgentNote[] }) {
  return (
    <section className="agent-showcase" data-testid="agent-showcase" aria-label="Agents helping with this choice">
      <h2>Helping with this</h2>
      <div className="agent-row">
        {agents.map((agent) => (
          <article key={agent.id} className="agent-card" data-agent={agent.id}>
            <span className="choice-label">{agent.name}</span>
            <span className="note">{agent.note}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

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
  const [reload, setReload] = useState(0);
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
  }, [prompt, residentId, reload]);

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
    setPlan(null);
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

  if (!prompt) {
    return (
      <div className="empty">
        <h2>No choices waiting</h2>
        <p>When there is something to decide, it will be here.</p>
      </div>
    );
  }

  const options = choice?.options ?? [];
  const real = options.filter((option) => option.label.toLowerCase() !== NOT_DECIDED_LABEL);
  const later = options.find((option) => option.label.toLowerCase() === NOT_DECIDED_LABEL);

  return (
    <div className="choice-board">
      <header className="choice-q">
        <div className="stack-sm">
          <h1>{choice?.question ?? prompt.question}</h1>
          {choice?.weekly_budget != null ? (
            <p className="lead">
              <Wallet size={24} aria-hidden="true" className="inline-icon" />
              <span>Weekly budget {money(choice.weekly_budget)}.</span>
            </p>
          ) : null}
        </div>
      </header>

      {loading ? (
        <div className="choice-loading" role="status">
          <p className="suggestions-head"><ThinkingDots /> Loading your options…</p>
          <div className="option-grid" aria-hidden="true">
            {[0, 1].map((item) => (
              <div className="option-skeleton" key={item}>
                <span className="option-skeleton-photo" />
                <span className="option-skeleton-line" />
                <span className="option-skeleton-line" />
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="callout" data-tone="error" role="alert">
          <div className="callout-body">
            <p>{choice ? error : "Your options couldn’t load. Please try again."}</p>
            {!choice && !loading ? (
              <button type="button" className="btn" data-variant="secondary" data-size="lg"
                data-longpress="own"
                onPointerDown={(event) => hold(event, "Try again")}
                onClick={() => {
                  if (pressed.current) { pressed.current = false; return; }
                  setError(null); setLoading(true); setReload((value) => value + 1);
                }}>
                <RotateCcw size={22} aria-hidden="true" />
                Try again
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {status ? (
        <div className="decision" data-tone={status === "chosen" ? undefined : "later"}>
          <span className="decision-mark" aria-hidden="true">
            {status === "chosen" ? <Check size={56} strokeWidth={2.5} /> : <Clock size={52} strokeWidth={2.2} />}
          </span>
          <h2 className="decision-title" data-testid="choice-standing">
            {choiceStanding(status, residentName, chosen)}
          </h2>
          <p className="lead">
            {status === "chosen"
              ? "Saved to " + residentName + "'s choices."
              : "That's okay. This choice is saved for later."}
          </p>
          <div className="row">
            <button
              type="button"
              className="btn"
              data-variant="secondary"
              data-size="xl"
              data-longpress="own"
              onPointerDown={(event) => hold(event, "Undo")}
              onClick={() => {
                if (pressed.current) {
                  pressed.current = false;
                  return;
                }
                setStatus(null);
                setChosen(null);
                setPlan(null);
              }}
            >
              <RotateCcw size={22} aria-hidden="true" />
              Undo
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="option-grid" role="group" aria-label="Choices">
            {real.map((option) => (
              <article key={option.label} className="option-card" data-picked={chosen === option.label ? "" : undefined}>
                <button
                  type="button"
                  className="option-select"
                  data-longpress="own"
                  aria-label={option.label}
                  aria-pressed={chosen === option.label}
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
                  {option.photo ? (
                    <span className="art option-photo">
                      <DeliveredPhoto publicId={option.photo} mode="story" className="tile-img" />
                    </span>
                  ) : (
                    <OptionArt label={option.label} />
                  )}
                  <span className="option-body">
                    <span className="option-title">
                      <span className="option-name">{option.label}</span>
                      <span className="price">{money(option.cost)}</span>
                    </span>
                    {option.consequence ? <span className="option-line">{phraseOf(option.consequence)}</span> : null}
                    <span className="option-line">{consequence(option.cost, choice?.weekly_budget ?? null)}</span>
                    <span className="option-cta">Tap to choose</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="btn option-hear"
                  data-variant="secondary"
                  data-size="lg"
                  data-longpress="own"
                  aria-label={`Hear about ${option.label}`}
                  onPointerDown={(event) => hold(event, `Hear about ${option.label}`)}
                  onClick={() => {
                    if (pressed.current) {
                      pressed.current = false;
                      return;
                    }
                    void hear(
                      [option.label, option.consequence ? phraseOf(option.consequence) : "", consequence(option.cost, choice?.weekly_budget ?? null)]
                        .filter(Boolean)
                        .join(". "),
                    );
                  }}
                >
                  <Volume2 size={22} aria-hidden="true" />
                  Hear this
                </button>
              </article>
            ))}
          </div>
          {later ? (
            <div className="not-ready">
              <button
                type="button"
                className="btn"
                data-variant="secondary"
                data-size="xl"
                data-choice={later.label}
                data-longpress="own"
                disabled={busy || loading}
                onPointerDown={(event) => hold(event, later.label)}
                onClick={() => {
                  if (pressed.current) {
                    pressed.current = false;
                    return;
                  }
                  void pick(later);
                }}
              >
                <Clock size={24} aria-hidden="true" />
                Not decided yet, I&apos;m not ready
              </button>
            </div>
          ) : null}
        </>
      )}
      {status === "chosen" && !plan && !error ? (
        <p className="suggestions-head" role="status">
          <ThinkingDots /> The agents are looking this up.
        </p>
      ) : null}
      {plan && plan.agents.length > 0 ? <AgentShowcase agents={plan.agents} /> : null}
      {plan ? <ApprovalCard residentId={residentId} plan={plan} /> : null}
    </div>
  );
}

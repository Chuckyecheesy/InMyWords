"use client";

import { useEffect, useRef, useState } from "react";
import { approveAction, cancelAction, speak } from "@/lib/api";
import { stepPhoto } from "@/lib/action-photos";
import { DeliveredPhoto } from "@/components/DeliveredPhoto";
import { CalendarDays, ClipboardCheck, Mail, Ticket } from "lucide-react";
import { isDrawnPlaceholder } from "@/lib/demo-photos";
import { money } from "@/lib/format";
import type { ActionPlan } from "@/lib/api";
import { BigButton } from "./shared";
import { RunningEllipsis } from "./RunningEllipsis";

/** After Approve, the resident can still undo before the steps run. */
export const CANCEL_WINDOW_MS = 5000;
const APPROVE_WAIT_MS = 25_000;

type StepResult = { step: string; result: string };

function stepOutput(data: {
  results?: { step?: unknown; result?: unknown }[];
  error?: unknown;
  refused?: unknown;
}): { error: string } | { results: StepResult[] } {
  if (data.refused || typeof data.error === "string") {
    return { error: typeof data.error === "string" ? data.error : "The steps did not run." };
  }
  const results = Array.isArray(data.results)
    ? data.results.flatMap((item) => {
        if (!item || typeof item.result !== "string" || !item.result.trim()) return [];
        const step = typeof item.step === "string" && item.step.trim() ? item.step : "step";
        return [{ step, result: item.result.trim() }];
      })
    : [];
  return { results };
}

export function ApprovalCard({
  residentId,
  plan,
}: {
  residentId: string;
  plan: ActionPlan;
}) {
  const [phase, setPhase] = useState<"proposed" | "window" | "running" | "done" | "cancelled">("proposed");
  const [note, setNote] = useState<string | null>(null);
  const [results, setResults] = useState<StepResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  function hear(label: string) {
    void speak({ resident_id: residentId, text: label });
  }

  function clearTimer() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  async function finish() {
    if (!alive.current) return;
    setPhase("running");
    setNote("The steps are running");
    setResults([]);
    setError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), APPROVE_WAIT_MS);
    const result = await approveAction(String(plan.plan_id), residentId, controller.signal);
    window.clearTimeout(timeout);
    if (!alive.current) return;
    if (!result.ok) {
      setError(result.error);
      setNote(null);
      setPhase("proposed");
      return;
    }
    const output = stepOutput(result.data);
    if ("error" in output) {
      setError(output.error);
      setNote(null);
      setPhase("proposed");
      return;
    }
    setResults(output.results);
    setPhase("done");
    setNote("The steps are done.");
  }

  function approve() {
    setError(null);
    setPhase("window");
    setNote("Approved. You can still cancel.");
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void finish();
    }, CANCEL_WINDOW_MS);
  }

  async function cancel() {
    clearTimer();
    setError(null);
    const result = await cancelAction(String(plan.plan_id), residentId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPhase("cancelled");
    setNote("Cancelled. Nothing was booked.");
  }

  return (
    <section className="approval-card" data-testid="approval-card" aria-label="Approval card" data-phase={phase}>
      <p className="eyebrow">Next step</p>
      <h2>Approve this plan?</h2>
      <p className="lead">{plan.goal}</p>
      <div className="step-grid">
        {plan.online_steps.map((step) => (
          <StepPicture
            key={step.step}
            residentId={residentId}
            step={step.step}
            label={step.detail}
            extra={step.cost > 0 ? money(step.cost) : null}
          />
        ))}
        {plan.staff_tasks.map((task) => (
          <StepPicture
            key={task.task}
            residentId={residentId}
            step="create_staff_task"
            label={task.task}
            extra={task.due}
          />
        ))}
      </div>
      <p className="approval-total">Total {money(plan.total_cost)}.</p>
      {note ? (
        <p className="approval-note" data-testid="approval-note" role="status">
          {note}
          {phase === "running" ? <RunningEllipsis /> : null}
        </p>
      ) : null}
      {phase === "done" && results.length > 0 ? (
        <ul className="step-results" data-testid="step-results">
          {results.map((row) => (
            <li key={`${row.step}-${row.result}`}>{row.result}</li>
          ))}
        </ul>
      ) : null}
      {phase === "window" ? <span className="cancel-window" aria-hidden="true" /> : null}
      {error ? <p className="note">{error}</p> : null}
      {phase === "proposed" || phase === "window" ? (
        <div className="row approval-actions">
          {phase === "proposed" ? (
            <BigButton tone="approve" onLongPress={hear} onClick={approve}>
              Approve
            </BigButton>
          ) : null}
          <BigButton tone="reject" onLongPress={hear} onClick={() => void cancel()}>
            Cancel
          </BigButton>
        </div>
      ) : null}
    </section>
  );
}

function StepPicture({
  residentId,
  step,
  label,
  extra,
}: {
  residentId: string;
  step: string;
  label: string;
  extra: string | null;
}) {
  const photo = stepPhoto(residentId, step);
  const Icon =
    step === "send_message" ? Mail : step === "add_to_calendar" ? CalendarDays : step === "book_activity" ? Ticket : ClipboardCheck;
  return (
    <article className="step-card" data-step={step}>
      {isDrawnPlaceholder(photo) ? (
        <span className="step-photo step-letter" aria-hidden="true">
          <Icon size={44} strokeWidth={1.75} />
        </span>
      ) : (
        <span className="step-photo">
          <DeliveredPhoto publicId={photo} mode="story" className="tile-img" />
        </span>
      )}
      <span className="step-label">{label}</span>
      {extra ? <span className="note">{extra}</span> : null}
    </article>
  );
}

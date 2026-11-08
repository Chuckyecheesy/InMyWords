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

/** After Approve, the resident can still undo before the steps run. */
export const CANCEL_WINDOW_MS = 5000;

export function ApprovalCard({
  residentId,
  plan,
}: {
  residentId: string;
  plan: ActionPlan;
}) {
  const [phase, setPhase] = useState<"proposed" | "window" | "done" | "cancelled">("proposed");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
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
    const result = await approveAction(String(plan.plan_id), residentId);
    if (!result.ok) {
      setError(result.error);
      setPhase("proposed");
      return;
    }
    setPhase("done");
    setNote("Approved. The steps are running.");
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
        </p>
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

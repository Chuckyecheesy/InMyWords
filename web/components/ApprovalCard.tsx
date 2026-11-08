"use client";

import { useRef, useState } from "react";
import { approveAction, cancelAction } from "@/lib/api";
import { stepPhoto } from "@/lib/action-photos";
import { tileImageUrl } from "@/lib/cloudinary";
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
    <section className="block" data-testid="approval-card" aria-label="Approval card">
      <h2>Approve this plan?</h2>
      <p>{plan.goal}</p>
      <div className="choice-options">
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
      <p>Total {money(plan.total_cost)}.</p>
      {note ? <p data-testid="approval-note">{note}</p> : null}
      {error ? <p className="note">{error}</p> : null}
      {phase === "proposed" || phase === "window" ? (
        <div className="speak-actions">
          {phase === "proposed" ? (
            <BigButton tone="approve" onClick={approve}>
              Approve
            </BigButton>
          ) : null}
          <BigButton tone="reject" onClick={() => void cancel()}>
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
  const calm = tileImageUrl(photo, "calm");
  const contrast = tileImageUrl(photo, "contrast");
  return (
    <article className="choice-button" data-step={step}>
      {calm && contrast ? (
        <picture>
          <img className="choice-img choice-img-calm" src={calm} alt="" />
          <img className="choice-img choice-img-contrast" src={contrast} alt="" />
        </picture>
      ) : (
        <span className="choice-letter" aria-hidden="true">
          {label.slice(0, 1)}
        </span>
      )}
      <span className="choice-label">{label}</span>
      {extra ? <span className="note">{extra}</span> : null}
    </article>
  );
}

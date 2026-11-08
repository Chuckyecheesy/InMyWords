"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Highlight, Resident } from "@/lib/types";
import { BigButton } from "./shared";
import { HowICommunicateCard } from "./HowICommunicateCard";
import { SourceChip } from "./SourceChip";

export type OnboardingStep = "essentials" | "story" | "routines" | "complete";

interface OnboardingFlowProps {
  resident: Resident;
  essentials: Highlight[];
  routines: Highlight[];
}

const STEPS: { step: OnboardingStep; label: string; number: number }[] = [
  { step: "essentials", label: "Essentials", number: 1 },
  { step: "story", label: "Story", number: 2 },
  { step: "routines", label: "Routines", number: 3 },
  { step: "complete", label: "Ready to go", number: 4 },
];

function formatSourceLabel(
  source: "resident" | "staff" | "document" | "emh" | "inferred" | "pattern",
  date?: string | null
): string {
  if (source === "resident") return "In their words";
  if (source === "document") return `From records, ${date ? new Date(date).getFullYear() : "2019"}`;
  if (source === "inferred") return "Pattern noticed";
  if (source === "pattern") return "Pattern noticed";
  if (source === "staff") {
    if (date) {
      const d = new Date(date);
      return `Staff note, ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    }
    return "Staff note";
  }
  if (source === "emh") return "EMH";
  return source;
}

export default function OnboardingFlow({
  resident,
  essentials,
  routines,
}: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("essentials");
  const [completed, setCompleted] = useState<Set<OnboardingStep>>(new Set());

  // Load progress from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(`onboarding-${resident.id}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      setCurrentStep(parsed.step);
      setCompleted(new Set(parsed.completed));
    }
  }, [resident.id]);

  // Save progress to localStorage
  useEffect(() => {
    localStorage.setItem(
      `onboarding-${resident.id}`,
      JSON.stringify({
        step: currentStep,
        completed: Array.from(completed),
      })
    );
  }, [currentStep, completed, resident.id]);

  function goToStep(step: OnboardingStep) {
    setCurrentStep(step);
    window.scrollTo(0, 0);
  }

  function handleNext() {
    setCompleted((prev) => new Set([...prev, currentStep]));
    const currentIndex = STEPS.findIndex((s) => s.step === currentStep);
    if (currentIndex < STEPS.length - 1) {
      goToStep(STEPS[currentIndex + 1].step);
    }
  }

  function handleBack() {
    const currentIndex = STEPS.findIndex((s) => s.step === currentStep);
    if (currentIndex > 0) {
      goToStep(STEPS[currentIndex - 1].step);
    }
  }

  const currentStepIndex = STEPS.findIndex((s) => s.step === currentStep);
  const progressPercent = ((currentStepIndex + 1) / STEPS.length) * 100;

  return (
    <div className="onboarding-container">
      {/* Progress Indicator */}
      <nav className="onboarding-progress" aria-label="Onboarding progress">
        <div className="progress-bar-track">
          <div
            className="progress-bar-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="progress-steps">
          {STEPS.map((s) => (
            <div
              key={s.step}
              className="progress-step"
              data-step={s.step}
              data-status={
                currentStep === s.step
                  ? "current"
                  : completed.has(s.step)
                    ? "completed"
                    : "pending"
              }
              aria-current={currentStep === s.step ? "page" : undefined}
            >
              <span className="step-number">
                {completed.has(s.step) ? "✓" : s.number}
              </span>
              <span className="step-label">{s.label}</span>
            </div>
          ))}
        </div>
      </nav>

      {/* Header */}
      <div className="onboarding-header">
        <h1>Onboarding: {resident.name}</h1>
      </div>

      {/* Essentials Section */}
      {currentStep === "essentials" && (
        <section className="onboarding-section" key="essentials">
          <HowICommunicateCard residentId={resident.id} name={resident.name} />
          <h2>Key Facts About {resident.name}</h2>
          <div className="essentials-list">
            {essentials.length > 0 ? (
              essentials.map((item, idx) => (
                <div key={idx} className="essential-item">
                  <p>{item.text}</p>
                  <span className="essential-source">
                    {formatSourceLabel(item.source, item.date)}
                  </span>
                </div>
              ))
            ) : (
              <p className="empty-state">No essentials yet.</p>
            )}
          </div>
          <p className="section-eyebrow">Quick essentials for your first shift (~2 minutes)</p>
        </section>
      )}

      {/* Story Section */}
      {currentStep === "story" && (
        <section className="onboarding-section" key="story">
          <h2>{resident.name}'s Story</h2>
          <p className="section-preview">
            {resident.name}'s story covers their background, values, and what matters to them.
            Read it to understand them better.
          </p>
          <Link href={`/resident/${resident.id}/story`} target="_blank">
            <BigButton tone="neutral">📖 Read the full story</BigButton>
          </Link>
        </section>
      )}

      {/* Routines Section */}
      {currentStep === "routines" && (
        <section className="onboarding-section" key="routines">
          <h2>{resident.name}'s Week</h2>
          <div className="routines-timeline">
            {routines.length > 0 ? (
              routines.map((item, idx) => (
                <div key={idx} className="routine-item">
                  <p>{item.text}</p>
                  <span className="routine-source">
                    {formatSourceLabel(item.source, item.date)}
                  </span>
                </div>
              ))
            ) : (
              <p className="empty-state">No routines documented yet.</p>
            )}
          </div>
        </section>
      )}

      {/* Complete Section */}
      {currentStep === "complete" && (
        <section className="onboarding-section" key="complete">
          <div className="complete-message">
            <h2>✓ You're ready!</h2>
            <p>
              You now know the essentials about {resident.name}. Ask the Coach questions,
              check the Handoff, or start your shift.
            </p>
          </div>
          <div className="next-steps">
            <Link href={`/staff/${resident.id}/coach`}>
              <BigButton tone="neutral">💬 Ask the Coach</BigButton>
            </Link>
            <Link href={`/staff/handoff?resident=${resident.id}`}>
              <BigButton tone="neutral">📋 See the Handoff</BigButton>
            </Link>
            <button
              className="ready-button"
              onClick={() => {
                // Mark as complete in a real app, navigate to coach or handoff
                window.location.href = `/staff/${resident.id}/coach`;
              }}
            >
              ✅ I'm ready to start
            </button>
          </div>
        </section>
      )}

      {/* Coach Link (visible on all sections) */}
      {currentStep !== "complete" && (
        <div className="coach-sidebar-link">
          <Link href={`/staff/${resident.id}/coach`}>
            <button className="coach-quick-link">💬 Ask the Coach anytime</button>
          </Link>
        </div>
      )}

      {/* Navigation Buttons */}
      {currentStep !== "complete" && (
        <div className="onboarding-nav">
          <button
            className="nav-button back-button"
            onClick={handleBack}
            disabled={currentStep === "essentials"}
            aria-label="Go to previous section"
          >
            ← Back
          </button>
          <button
            className="nav-button next-button"
            onClick={handleNext}
            aria-label="Go to next section"
          >
            Next: {STEPS[currentStepIndex + 1]?.label} →
          </button>
        </div>
      )}
    </div>
  );
}

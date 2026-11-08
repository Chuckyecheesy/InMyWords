"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useStoredString } from "@/lib/client-store";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  Hand,
  Hourglass,
  ListChecks,
  MessageSquareText,
  Pause,
  Play,
  ShieldCheck,
  Volume2,
} from "lucide-react";
import { speak } from "@/lib/api";
import { forSpeech } from "@/lib/format";
import { ONBOARDING_EVENT, ONBOARDING_STEPS, onboardingKey, parseOnboarding, writeOnboarding } from "@/lib/onboarding";
import type { ResidentProfile, StoryChapter } from "@/lib/types";
import { CoachChat } from "./CoachChat";
import { HowICommunicateCard } from "./HowICommunicateCard";
import { Badge, FactList, Progress, SourceBadge } from "./ui";

const STEPS = [
  { title: "Meet", hint: "Who they are" },
  { title: "How they communicate", hint: "Tiles, yes/no, approval" },
  { title: "Routines & preferences", hint: "What helps the day go well" },
  { title: "Their story", hint: "In their own words" },
  { title: "Ask the Coach", hint: "Anything else" },
];

function ChapterPlayer({ residentId, chapter }: { residentId: string; chapter: StoryChapter }) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [src, setSrc] = useState<string | null>(null);

  async function play() {
    if (state === "playing") {
      setState("idle");
      return;
    }
    if (src) {
      setState("playing");
      return;
    }
    setState("loading");
    const result = await speak({ resident_id: residentId, text: forSpeech(chapter.text) });
    if (!result.ok) {
      if (chapter.audio_url) {
        setSrc(chapter.audio_url);
        setState("playing");
        return;
      }
      setState("error");
      return;
    }
    setSrc(result.data.audio_url);
    setState("playing");
  }

  return (
    <div className="row">
      <button type="button" className="btn" data-variant="secondary" data-size="sm" onClick={() => void play()} disabled={state === "loading"}>
        {state === "loading" ? <span className="spinner" aria-hidden="true" /> : state === "playing" ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
        {state === "playing" ? "Stop" : "Listen"}
      </button>
      {state === "error" ? <span className="muted" style={{ fontSize: 14 }}>Audio isn&apos;t available right now.</span> : null}
      {state === "playing" && src ? <audio src={src} autoPlay onEnded={() => setState("idle")} /> : null}
    </div>
  );
}

export function OnboardingFlow({
  residentId,
  name,
  profile,
  chapters,
}: {
  residentId: string;
  name: string;
  profile: ResidentProfile;
  chapters: StoryChapter[];
}) {
  const raw = useStoredString(onboardingKey(residentId), ONBOARDING_EVENT);
  const done = useMemo(() => parseOnboarding(raw), [raw]);
  const [picked, setPicked] = useState<number | null>(null);
  const firstOpen = [0, 1, 2, 3, 4].find((index) => !done.includes(index)) ?? 0;
  const step = picked ?? firstOpen;
  const finished = done.length >= ONBOARDING_STEPS;
  const setStep = (index: number) => setPicked(index);

  function markAndGo(next: number) {
    const updated = done.includes(step) ? done : [...done, step].sort();
    writeOnboarding(residentId, updated);
    if (next < STEPS.length) setPicked(next);
  }

  function restart() {
    writeOnboarding(residentId, []);
    setPicked(0);
  }

  const own = [...profile.likes, ...profile.dislikes, ...profile.routines].filter((item) => item.source === "resident");
  const approved = chapters.filter((chapter) => chapter.status === "approved");
  const drafts = chapters.length - approved.length;

  if (finished) {
    return (
      <div className="complete">
        <span className="decision-mark" aria-hidden="true">
          <CircleCheck size={48} />
        </span>
        <h2 style={{ fontSize: 28 }}>You&apos;re ready for your first shift with {name}</h2>
        <p className="muted" style={{ maxWidth: "52ch" }}>
          You&apos;ve covered who {name} is, how {name} communicates, daily routines and {name}&apos;s own story. Check
          what changed since the last shift before you start.
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link href={`/staff/handoff?resident=${residentId}`} className="btn" data-variant="primary">
            See since last shift
          </Link>
          <button type="button" className="btn" data-variant="ghost" onClick={restart}>
            Review again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="onboard">
      <ol className="stepper" aria-label="Onboarding steps">
        <li className="stepper-title">
          <h2>Onboarding: {name}</h2>
        </li>
        <li className="stepper-progress">
          <span>
            {done.length} of {STEPS.length} done
          </span>
          <Progress value={done.length / STEPS.length} label="Onboarding progress" />
        </li>
        {STEPS.map((item, index) => (
          <li key={item.title}>
            <button
              type="button"
              className="step-btn"
              aria-current={index === step ? "step" : undefined}
              data-done={done.includes(index) ? "" : undefined}
              onClick={() => setStep(index)}
            >
              <span className="step-num" aria-hidden="true">
                {done.includes(index) ? <Check size={16} strokeWidth={3} /> : index + 1}
              </span>
              <span>
                {index === 0 ? `Meet ${name}` : item.title}
                <small>{item.hint}</small>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <section className="step-body panel" key={step} aria-labelledby="step-title">
        {step === 0 ? (
          <>
            <div className="step-head">
              <p className="eyebrow">Step 1 · About 1 minute</p>
              <h2 id="step-title">Meet {name}</h2>
              <p>
                {name} lives at {profile.home}. Start with what {name} has said, in {name}&apos;s own words.
              </p>
            </div>
            {profile.summary ? (
              <div className="profile-hero" style={{ marginBottom: 0, gridTemplateColumns: "1fr" }}>
                <p className="profile-quote">&ldquo;{forSpeech(profile.summary.text)}&rdquo;</p>
                <div>
                  <SourceBadge source={profile.summary.source} name={name} date={profile.summary.date} />
                </div>
              </div>
            ) : null}
            <h3>Things {name} wants you to know</h3>
            <FactList items={own} name={name} />
          </>
        ) : null}

        {step === 1 ? (
          <>
            <div className="step-head">
              <p className="eyebrow">Step 2 · About 2 minutes</p>
              <h2 id="step-title">How {name} communicates</h2>
            </div>
            <FactList items={profile.communication} name={name} />
            <HowICommunicateCard residentId={residentId} name={name} />
            <h3>How Speak For Me works</h3>
            <ol className="flow-demo">
              <li>
                <strong>
                  <Hand size={18} aria-hidden="true" /> 1. Pictures
                </strong>
                {name} taps picture tiles, like coffee + now.
              </li>
              <li>
                <strong>
                  <MessageSquareText size={18} aria-hidden="true" /> 2. Suggestions
                </strong>
                The app offers 2–3 sentences.
              </li>
              <li>
                <strong>
                  <ShieldCheck size={18} aria-hidden="true" /> 3. {name} checks
                </strong>
                {name} picks one and reviews it.
              </li>
              <li>
                <strong>
                  <Volume2 size={18} aria-hidden="true" /> 4. {name} approves
                </strong>
                Only then is it spoken, in {name}&apos;s voice.
              </li>
            </ol>
            <h3>Good practice</h3>
            <ul className="tips">
              <li>
                <span aria-hidden="true">
                  <ListChecks size={18} />
                </span>
                Ask one question at a time. Offer real options.
              </li>
              <li>
                <span aria-hidden="true">
                  <Hourglass size={18} />
                </span>
                Wait. There are no time limits, don&apos;t finish {name}&apos;s sentences.
              </li>
              <li>
                <span aria-hidden="true">
                  <ShieldCheck size={18} />
                </span>
                Choices belong to {name}. If {name} isn&apos;t ready, &ldquo;not decided yet&rdquo; is a fine answer.
              </li>
            </ul>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="step-head">
              <p className="eyebrow">Step 3 · About 2 minutes</p>
              <h2 id="step-title">Routines &amp; preferences</h2>
              <p>Every fact shows where it came from. Records from 2021 may be out of date, check with {name}.</p>
            </div>
            <h3>Routines</h3>
            <FactList items={profile.routines} name={name} />
            <h3>What matters</h3>
            <FactList items={profile.likes} name={name} />
            {profile.dislikes.length > 0 ? (
              <>
                <h3>What&apos;s hard, and what helps</h3>
                <FactList items={profile.dislikes} name={name} />
              </>
            ) : null}
            {profile.pending.length > 0 ? (
              <div className="callout" data-tone="info">
                <Badge tone="pattern" label="Pattern noticed" />
                <div className="callout-body">
                  {profile.pending[0].text} Not confirmed by {name} yet, offer both options.
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div className="step-head">
              <p className="eyebrow">Step 4 · About 2 minutes</p>
              <h2 id="step-title">{name}&apos;s story</h2>
              <p>Only chapters {name} has approved are shown here.</p>
            </div>
            {approved.length === 0 ? (
              <p className="muted">{name} hasn&apos;t shared a chapter yet.</p>
            ) : (
              <ul className="feed">
                {approved.map((chapter) => (
                  <li key={chapter.id}>
                    <span className="feed-icon" data-tone="resident" aria-hidden="true">
                      <Volume2 size={18} />
                    </span>
                    <div className="feed-body">
                      <p style={{ fontWeight: 700 }}>{chapter.title}</p>
                      <p>&ldquo;{forSpeech(chapter.text)}&rdquo;</p>
                      <div className="feed-meta">
                        <Badge tone="resident" label={`In ${name}'s words`} />
                      </div>
                      <ChapterPlayer residentId={residentId} chapter={chapter} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {drafts > 0 ? (
              <p className="muted" style={{ fontSize: 15 }}>
                {drafts} more chapter{drafts === 1 ? " is" : "s are"} still a draft and private to {name}.
              </p>
            ) : null}
          </>
        ) : null}

        {step === 4 ? (
          <>
            <div className="step-head">
              <p className="eyebrow">Step 5</p>
              <h2 id="step-title">Ask the Coach</h2>
              <p>Ask anything else. The Coach answers only from {name}&apos;s profile, records and staff notes.</p>
            </div>
            <CoachChat residentId={residentId} residentName={name} compact />
          </>
        ) : null}

        <div className="step-foot">
          <button type="button" className="btn" data-variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
            <ArrowLeft size={18} aria-hidden="true" />
            Back
          </button>
          <button type="button" className="btn" data-variant="primary" onClick={() => markAndGo(step + 1)}>
            {step === STEPS.length - 1 ? "Finish onboarding" : "Mark done & continue"}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>
  );
}

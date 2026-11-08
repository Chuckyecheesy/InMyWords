"use client";

import { useEffect, useState } from "react";
import { getInputProfile } from "@/lib/api";
import { communicateSentences } from "@/lib/input/profile";
import type { InputProfile } from "@/lib/input/types";
import { SourceChip } from "./SourceChip";

/**
 * "How {name} communicates" (GAZE_GESTURE_PLAN G7) — top of Essentials.
 * Template sentences from the input profile; labelled as input history,
 * never presented as the resident's own words.
 */
export function HowICommunicateCard({
  residentId,
  name,
}: {
  residentId: string;
  name: string;
}) {
  const [profile, setProfile] = useState<InputProfile | null>(null);

  useEffect(() => {
    let alive = true;
    void getInputProfile(residentId).then((result) => {
      if (alive) setProfile(result);
    });
    return () => {
      alive = false;
    };
  }, [residentId]);

  if (!profile) return null;
  const sentences = communicateSentences(profile, name);

  return (
    <article className="card how-i-communicate">
      <header className="card-head">
        <h3>How {name} communicates</h3>
        <SourceChip tone="pattern" label={`From ${name}'s input history`} />
      </header>
      <ul>
        {sentences.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {profile.events_counted > 0 ? (
        <p className="note">Based on {profile.events_counted} interactions.</p>
      ) : null}
    </article>
  );
}

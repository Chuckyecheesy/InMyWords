/**
 * Input profile + adaptive settings (GAZE_GESTURE_PLAN G6) and the
 * "How I Communicate" card templates (§6). Template text only, the card
 * can never invent behaviour, and it is labelled "From input history".
 */

import type { InputProfile } from "./types";

export const DEFAULT_PROFILE: InputProfile = {
  resident_id: "",
  preferred_select: "touch",
  preferred_yes: "touch",
  dwell_ms: 1000,
  rates: {},
  notes: [],
  events_counted: 0,
  confidence: "low",
};

export function currentWindow(date = new Date()): "morning" | "afternoon" | "evening" {
  const hour = date.getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/** §G6: if a time-of-day note applies right now, start on the Touch grid. */
export function startOnTouchGrid(profile: InputProfile, date = new Date()): boolean {
  return profile.notes.some((note) => note.toLowerCase().includes(currentWindow(date)));
}

/** §6 Coach card templates. Pronouns kept simple: name + they/them. */
export function communicateSentences(profile: InputProfile, name: string): string[] {
  const lines: string[] = [];
  if (profile.events_counted === 0) {
    return [`Still learning. Ask ${name} how they like to answer.`];
  }
  lines.push(
    profile.preferred_select === "gaze"
      ? `${name} selects by looking at pictures.`
      : `${name} selects by tapping pictures.`,
  );
  if (profile.preferred_select === "gaze") {
    const seconds = (profile.dwell_ms / 1000).toFixed(1).replace(/\.0$/, "");
    const unit = seconds === "1" ? "second" : "seconds";
    lines.push(`Give them time. ${name} holds their gaze about ${seconds} ${unit}.`);
  }
  lines.push(
    profile.preferred_yes === "Thumb_Up"
      ? "A thumbs up means yes."
      : `${name} taps the green check for yes.`,
  );
  const note = profile.notes[0];
  if (note) lines.push(note);
  if (profile.confidence === "low") {
    lines.push(`Still learning. Ask ${name} how they like to answer.`);
  }
  return lines.slice(0, 4);
}

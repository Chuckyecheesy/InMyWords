/**
 * Device speech (the tablet's built-in voice) for interface help only:
 * reading instructions, button labels and options aloud. The resident's
 * own words always go through POST /speak in their chosen voice, after
 * they approve them.
 */

import { forSpeech } from "./format";

/** A bit under the browser default (1) so help is unhurried. */
const RATE = 0.8;

export function deviceSpeechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.getVoices();
}

function preferredVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const english = voices.filter((voice) => /^en([-_]|$)/i.test(voice.lang));
  const score = (voice: SpeechSynthesisVoice) => {
    const name = voice.name.toLowerCase();
    let points = 0;
    if (/natural|neural|premium|enhanced|siri/.test(name)) points += 6;
    if (/samantha|karen|moira|serena|daniel|fiona|tessa|ava|allison|nicky|google/.test(name)) points += 4;
    if (voice.lang.toLowerCase().startsWith("en-ca")) points += 3;
    if (/en-gb|en-us|en-au/.test(voice.lang.toLowerCase())) points += 1;
    if (/espeak|compact|robot|zarvox/.test(name)) points -= 6;
    return points;
  };
  return english.sort((a, b) => score(b) - score(a))[0];
}

export function speakWithDevice(text: string): boolean {
  const spoken = forSpeech(text);
  if (!deviceSpeechAvailable() || !spoken) return false;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.rate = RATE;
    utterance.pitch = 1;
    utterance.lang = "en-CA";
    const voice = preferredVoice();
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

export function stopDeviceSpeech() {
  if (!deviceSpeechAvailable()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // nothing to stop
  }
}

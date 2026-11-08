/**
 * Device speech (the tablet's built-in voice) for interface help only:
 * reading instructions, button labels and options aloud. The resident's
 * own words always go through POST /speak in their chosen voice, after
 * they approve them.
 */

export function deviceSpeechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speakWithDevice(text: string): boolean {
  if (!deviceSpeechAvailable() || !text.trim()) return false;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.lang = "en-CA";
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

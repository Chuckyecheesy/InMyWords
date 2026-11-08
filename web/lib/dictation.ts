"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Voice input for the sentence bar, using the browser's speech recognition
 * (Chrome, Edge and Safari). Recognised words only ever land in the
 * editable sentence; nothing is spoken or saved until the resident chooses
 * Say my words (product rule 1).
 */

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const FRIENDLY_ERRORS: Record<string, string> = {
  "not-allowed": "The microphone is turned off for this page. Allow it in the browser to use your voice.",
  "service-not-allowed": "The microphone is turned off for this page. Allow it in the browser to use your voice.",
  "no-speech": "I didn't hear anything. Try again when you're ready.",
  "audio-capture": "No microphone was found.",
  network: "Voice input needs an internet connection.",
};

export function useDictation(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal;

  useEffect(() => {
    queueMicrotask(() => setSupported(recognitionConstructor() !== null));
    return () => recognition.current?.abort();
  }, []);

  function start() {
    const Ctor = recognitionConstructor();
    if (!Ctor || listening) return;
    setError(null);
    setInterim("");
    const rec = new Ctor();
    rec.lang = "en-CA";
    rec.interimResults = true;
    rec.continuous = false; // one phrase at a time; tap again to add more
    rec.onresult = (event) => {
      let heard = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) finalRef.current(result[0].transcript.trim());
        else heard += result[0].transcript;
      }
      setInterim(heard.trim());
    };
    rec.onerror = (event) => {
      if (event.error !== "aborted") setError(FRIENDLY_ERRORS[event.error] ?? "Voice input stopped. Try again.");
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      recognition.current = null;
    };
    recognition.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("Voice input couldn't start. Try again.");
    }
  }

  function stop() {
    recognition.current?.stop();
  }

  return { supported, listening, interim, error, start, stop };
}

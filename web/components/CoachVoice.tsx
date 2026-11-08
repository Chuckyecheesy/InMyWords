"use client";

/**
 * T1.6 Coach voice mode. Staff ask out loud; the ElevenLabs "Onboarding Coach"
 * agent answers out loud, only from /coach/ask, and says where each fact came
 * from. The typed CoachChat stays the default; this is an extra way in.
 */
import { useEffect, useRef, useState } from "react";
import { Conversation } from "@elevenlabs/client";
import { agentSession } from "@/lib/api";

type Line = { role: "you" | "coach"; text: string };
type State = "idle" | "starting" | "listening" | "talking" | "error";

export function CoachVoice({ residentId, residentName }: { residentId: string; residentName: string }) {
  const [state, setState] = useState<State>("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const session = useRef<{ endSession: () => Promise<void> } | null>(null);

  useEffect(() => () => void session.current?.endSession(), []);

  async function start() {
    setState("starting");
    setLines([]);
    const signedUrl = await agentSession("coach");
    if (!signedUrl) {
      setState("error");
      return;
    }
    try {
      session.current = await Conversation.startSession({
        signedUrl,
        textOnly: false,
        dynamicVariables: { resident_id: residentId, resident_name: residentName },
        onModeChange: ({ mode }) => setState(mode === "speaking" ? "talking" : "listening"),
        onMessage: ({ source, message }) =>
          setLines((current) => [...current, { role: source === "user" ? "you" : "coach", text: message }]),
        onDisconnect: () => {
          session.current = null;
          setState("idle");
        },
        onError: () => setState("error"),
      });
    } catch {
      // Usually a denied microphone. The typed chat still works.
      session.current = null;
      setState("error");
    }
  }

  async function stop() {
    await session.current?.endSession();
    session.current = null;
    setState("idle");
  }

  const live = state === "listening" || state === "talking" || state === "starting";

  return (
    <section className="block stack" aria-label="Ask out loud">
      <div className="coach-header">
        <h3>Ask out loud</h3>
        <button type="button" className="big-button" onClick={() => void (live ? stop() : start())}>
          {live ? "Stop" : "Start talking"}
        </button>
      </div>
      <p className="eyebrow" aria-live="polite">
        {state === "starting"
          ? "Connecting…"
          : state === "listening"
            ? `Listening. Ask anything about ${residentName}.`
            : state === "talking"
              ? "The coach is answering."
              : state === "error"
                ? "Voice mode isn't available right now (check the microphone). Typing still works."
                : "Talk to the coach instead of typing. Answers always say where they came from."}
      </p>
      {lines.length > 0 ? (
        <ol className="stack" aria-label="Conversation">
          {lines.map((line, index) => (
            <li key={index}>
              <strong>{line.role === "you" ? "You" : "Coach"}:</strong> {line.text}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

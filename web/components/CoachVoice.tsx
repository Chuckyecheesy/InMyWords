"use client";

/**
 * T1.6 Coach voice mode. Staff ask out loud; the ElevenLabs "Onboarding Coach"
 * agent answers out loud, only from /coach/ask, and says where each fact came
 * from. The typed CoachChat stays the default; this is an extra way in.
 */
import { useEffect, useRef, useState } from "react";
import { Conversation } from "@elevenlabs/client";
import { Mic, Square } from "lucide-react";
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
    <section className="panel" aria-label="Ask out loud">
      <div className="panel-head">
        <h2>
          <Mic size={20} aria-hidden="true" />
          Ask out loud
        </h2>
      </div>
      <button
        type="button"
        className="btn"
        data-variant={live ? "secondary" : "primary"}
        onClick={() => void (live ? stop() : start())}
      >
        {live ? <Square size={16} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
        {live ? "Stop" : "Start talking"}
      </button>
      <p className="muted" style={{ fontSize: 15 }} aria-live="polite">
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
        <ol className="feed" aria-label="Conversation">
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

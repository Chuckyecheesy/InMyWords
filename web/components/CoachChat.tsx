"use client";

import { useEffect, useRef, useState } from "react";
import { useClientValue } from "@/lib/client-store";
import { ArrowUp, CircleHelp, Mic, MicOff, MessagesSquare, Volume2 } from "lucide-react";
import { askCoach } from "@/lib/api";
import { forSpeech } from "@/lib/format";
import { sampleCoachAnswer, suggestedQuestions } from "@/lib/mock";
import { deviceSpeechAvailable, speakWithDevice } from "@/lib/speech";
import type { CoachAnswer } from "@/lib/types";
import { Badge, SourceBadge, ThinkingDots } from "./ui";

type Message = {
  id: number;
  question: string;
  answer?: CoachAnswer;
  origin?: "api" | "sample";
};

type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function provenanceLine(answer: CoachAnswer, name: string): string {
  const types = new Set(answer.sources.map((source) => source.type));
  if (types.has("resident")) return `Includes ${name}'s own words.`;
  if (types.has("inferred") || types.has("pattern")) return `Includes a pattern ${name} hasn't confirmed yet.`;
  return `From staff notes and records — not ${name}'s own words.`;
}

function Answer({ message, name }: { message: Message; name: string }) {
  const answer = message.answer;
  if (!answer) return null;
  const unknown = answer.sources.length === 0;
  return (
    <div className="msg-a">
      <span className="coach-avatar" aria-hidden="true">
        <MessagesSquare size={20} />
      </span>
      <div className="msg-a-body">
        <p>{answer.answer}</p>
        {unknown ? (
          <p className="msg-unknown">
            <CircleHelp size={16} aria-hidden="true" />
            Not on file. The Coach won&apos;t guess — ask {name}, or add a staff note once you know.
          </p>
        ) : (
          <div className="msg-sources">
            <span className="msg-sources-label">Sources · {provenanceLine(answer, name)}</span>
            <div className="chips">
              {answer.sources.map((source, index) => (
                <SourceBadge key={index} source={source.type} name={name} date={source.date} />
              ))}
            </div>
            {answer.sources
              .filter((source) => source.update_reason)
              .map((source, index) => (
                <p key={index} className="msg-unknown" data-tone="warning">
                  <CircleHelp size={16} aria-hidden="true" />
                  May have changed: {source.update_reason}. Check with {name}.
                </p>
              ))}
          </div>
        )}
        <div className="row" style={{ gap: 8 }}>
          {message.origin === "sample" ? <Badge tone="neutral" label="Offline sample answer" /> : null}
          {deviceSpeechAvailable() ? (
            <button
              type="button"
              className="btn"
              data-variant="ghost"
              data-size="sm"
              onClick={() => speakWithDevice(answer.answer)}
            >
              <Volume2 size={16} aria-hidden="true" />
              Read aloud
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CoachChat({
  residentId,
  residentName,
  compact = false,
}: {
  residentId: string;
  residentName: string;
  compact?: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const canListen = useClientValue(() => recognitionCtor() !== null, false);
  const logRef = useRef<HTMLDivElement | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const nextId = useRef(1);
  const suggestions = suggestedQuestions(residentId);
  const asked = new Set(messages.map((message) => message.question));

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const id = nextId.current++;
    setQuestion("");
    setMessages((current) => [...current, { id, question: trimmed }]);
    setLoading(true);
    const result = await askCoach({ resident_id: residentId, question: trimmed });
    let answer: CoachAnswer;
    let origin: Message["origin"] = "api";
    if (result.ok && typeof result.data.answer === "string") {
      answer = {
        answer: forSpeech(result.data.answer),
        sources: Array.isArray(result.data.sources) ? result.data.sources : [],
      };
    } else {
      origin = "sample";
      const sample = sampleCoachAnswer(residentId, trimmed);
      answer = sample
        ? { ...sample, answer: forSpeech(sample.answer) }
        : {
            answer: `I don't know. It's best to ask ${residentName}.`,
            sources: [],
          };
    }
    setMessages((current) => current.map((message) => (message.id === id ? { ...message, answer, origin } : message)));
    setLoading(false);
  }

  function toggleListening() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-CA";
    rec.interimResults = false;
    rec.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      setQuestion(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognition.current = rec;
    setListening(true);
    rec.start();
  }

  return (
    <div className="coach" data-compact={compact ? "" : undefined}>
      <div className="coach-log" ref={logRef} aria-live="polite">
        {messages.length === 0 ? (
          <div className="coach-intro">
            <div className="coach-intro-head">
              <span className="coach-avatar" aria-hidden="true">
                <MessagesSquare size={20} />
              </span>
              <div>
                <h2 style={{ fontSize: 19 }}>Ask about {residentName}</h2>
                <p className="muted" style={{ fontSize: 15 }}>
                  Every answer shows its sources. If it isn&apos;t on file, the Coach says so.
                </p>
              </div>
            </div>
          </div>
        ) : null}
        {messages.map((message) => (
          <div key={message.id} className="stack-sm">
            <p className="msg-q">{message.question}</p>
            {message.answer ? (
              <Answer message={message} name={residentName} />
            ) : (
              <div className="msg-a" role="status">
                <span className="coach-avatar" aria-hidden="true">
                  <MessagesSquare size={20} />
                </span>
                <div className="msg-a-body" style={{ color: "var(--ink-3)" }}>
                  <span className="row" style={{ gap: 10 }}>
                    <ThinkingDots /> Checking {residentName}&apos;s profile…
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="stack-sm">
        <div className="chips" aria-label="Suggested questions">
          {suggestions
            .filter((item) => !asked.has(item))
            .slice(0, compact ? 3 : 6)
            .map((item) => (
              <button key={item} type="button" className="chip-btn" disabled={loading} onClick={() => void ask(item)}>
                {item}
              </button>
            ))}
        </div>
        <form
          className="coach-input"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(question);
          }}
        >
          <label htmlFor={`coach-q-${residentId}`} className="sr-only">
            Ask a question about {residentName}
          </label>
          <input
            id={`coach-q-${residentId}`}
            type="text"
            placeholder={listening ? "Listening…" : `Ask about ${residentName}…`}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            disabled={loading}
            autoComplete="off"
          />
          {canListen ? (
            <button
              type="button"
              className="icon-btn"
              aria-pressed={listening}
              aria-label={listening ? "Stop listening" : "Ask by voice"}
              onClick={toggleListening}
            >
              {listening ? <MicOff size={20} aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}
            </button>
          ) : null}
          <button type="submit" className="btn" data-variant="primary" disabled={!question.trim() || loading}>
            <ArrowUp size={18} aria-hidden="true" />
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}

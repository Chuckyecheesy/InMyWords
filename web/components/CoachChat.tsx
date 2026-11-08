"use client";

import { useState } from "react";
import { askCoach } from "@/lib/api";
import { formatDay, formatYear } from "@/lib/format";
import { BigButton } from "./shared";

export interface Source {
  type: "resident" | "staff" | "emh" | "document" | "inferred" | "pattern";
  date: string;
  confidence?: number;
  update_reason?: string | null;
}

export interface CoachAnswer {
  answer: string;
  sources: Source[];
}

export function SourceChip({ source }: { source: Source }) {
  const formatDate = formatDay;
  const formatDocumentDate = formatYear;

  let label = "";
  switch (source.type) {
    case "resident":
      label = "In Marcus's words";
      break;
    case "staff":
      label = `Staff note, ${formatDate(source.date)}`;
      break;
    case "emh":
      label = "EMH";
      break;
    case "document":
      label = `From records, ${formatDocumentDate(source.date)}`;
      break;
    case "inferred":
    case "pattern":
      label = "Pattern noticed";
      break;
  }

  return (
    <span className="source-chip" data-type={source.type}>
      📌 {label}
      {source.update_reason ? ` ⚠️ May have changed. ${source.update_reason}.` : ""}
    </span>
  );
}

export function CoachChatMessage({
  question,
  answer,
  sources,
  isLoading = false,
}: {
  question: string;
  answer?: string;
  sources?: Source[];
  isLoading?: boolean;
}) {
  return (
    <div className="coach-message-pair">
      <div className="coach-message coach-question">
        <p>
          <strong>You:</strong> {question}
        </p>
      </div>

      {isLoading ? (
        <div className="coach-message coach-answer">
          <p className="thinking">Thinking...</p>
        </div>
      ) : answer ? (
        <div className="coach-message coach-answer">
          <p>
            <strong>Coach:</strong> {answer}
          </p>
          {sources && sources.length > 0 && (
            <div className="answer-sources">
              {sources.map((source, idx) => (
                <SourceChip key={idx} source={source} />
              ))}
            </div>
          )}
          {sources && sources.length === 0 && (
            <div className="answer-sources">
              <span className="source-chip" data-type="unknown">
                ℹ️ Unknown
              </span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function CoachChat({
  residentName = "Marcus",
  residentId = residentName.toLowerCase(),
}: {
  residentName?: string;
  residentId?: string;
}) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<
    Array<{ question: string; answer?: string; sources?: Source[] }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);

  async function handleAsk() {
    if (!question.trim()) return;

    const currentQuestion = question;
    setQuestion("");
    setMessages((prev) => [...prev, { question: currentQuestion }]);
    setIsLoading(true);

    const result = await askCoach({ resident_id: residentId, question: currentQuestion });
    const response: CoachAnswer = result.ok
      ? {
          answer: result.data.answer,
          sources: result.data.sources.map((src) => ({
            type: src.type,
            date: src.date ?? "",
            update_reason: src.update_reason,
          })),
        }
      : {
          answer: `I can't reach the Coach right now. It's best to ask ${residentName}.`,
          sources: [],
        };

    setMessages((prev) => [
      ...prev.slice(0, -1),
      {
        question: currentQuestion,
        answer: response.answer,
        sources: response.sources,
      },
    ]);
    setIsLoading(false);
  }

  return (
    <div className="coach-chat">
      <div className="coach-messages">
        {messages.map((msg, idx) => (
          <CoachChatMessage
            key={idx}
            question={msg.question}
            answer={msg.answer}
            sources={msg.sources}
          />
        ))}
        {isLoading && (
          <CoachChatMessage
            question={messages[messages.length - 1]?.question || ""}
            isLoading={true}
          />
        )}
      </div>

      <div className="coach-input">
        <label className="coach-field" htmlFor="coach-question">
          Ask a question
          <input
            id="coach-question"
            type="text"
            placeholder={`Ask about ${residentName}...`}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleAsk()}
            disabled={isLoading}
            className="coach-input-field"
          />
        </label>
        <BigButton
          onClick={handleAsk}
          disabled={!question.trim() || isLoading}
          tone="approve"
        >
          Ask
        </BigButton>
      </div>
    </div>
  );
}

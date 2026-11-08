"use client";

import { useState } from "react";
import { BigButton, AudioPlayback } from "./shared";

export interface Source {
  type: "resident" | "staff" | "emh" | "document" | "pattern";
  date: string;
  confidence?: number;
}

export interface CoachAnswer {
  answer: string;
  sources: Source[];
}

export function SourceChip({ source }: { source: Source }) {
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const month = date.toLocaleDateString("en-US", { month: "short" });
      const day = date.getDate();
      return `${month} ${day}`;
    } catch {
      return dateStr;
    }
  };

  const formatDocumentDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.getFullYear().toString();
    } catch {
      return dateStr;
    }
  };

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
    case "pattern":
      label = "Pattern noticed";
      break;
  }

  return (
    <span className="source-chip" data-type={source.type}>
      📌 {label}
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
}: {
  residentName?: string;
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

    // Simulate API call to POST /coach/ask
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Mock responses for demo
    const responses: Record<string, CoachAnswer> = {
      "What does Marcus like?": {
        answer: "Marcus enjoys bowling on Saturdays and watching the Raptors.",
        sources: [
          { type: "resident", date: "2026-01-08T10:30:00Z" },
          { type: "pattern", date: "2026-01-10T14:00:00Z" },
        ],
      },
      "What upsets Marcus?": {
        answer: "Loud noises and rushed transitions upset Marcus.",
        sources: [
          { type: "staff", date: "2026-01-15T09:00:00Z" },
          { type: "document", date: "2019-01-01T00:00:00Z" },
        ],
      },
      "Does Marcus prefer tea or coffee?": {
        answer:
          "Marcus has switched to tea recently. He picked tea 5 times this week.",
        sources: [
          { type: "pattern", date: "2026-01-10T14:00:00Z" },
          { type: "resident", date: "2026-01-15T14:23:00Z" },
        ],
      },
      "Who is important to Marcus?": {
        answer: "His sister Lisa and his staff member Lisa are both very important to him.",
        sources: [
          { type: "resident", date: "2026-01-08T10:30:00Z" },
          { type: "staff", date: "2026-01-10T15:30:00Z" },
        ],
      },
      "What is Marcus's weekly budget?": {
        answer: "Marcus has a weekly discretionary budget of $60.",
        sources: [
          { type: "resident", date: "2026-01-08T10:30:00Z" },
          { type: "document", date: "2019-01-01T00:00:00Z" },
        ],
      },
    };

    const response =
      responses[currentQuestion] ||
      responses[
        Object.keys(responses).find(
          (key) =>
            currentQuestion.toLowerCase().includes(key.split(" ").slice(0, 3).join(" ").toLowerCase()) ||
            key.toLowerCase().includes(currentQuestion.toLowerCase().split(" ").slice(0, 3).join(" "))
        ) || ""
      ] || {
        answer: `I don't know the answer to that. It's best to ask ${residentName}.`,
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

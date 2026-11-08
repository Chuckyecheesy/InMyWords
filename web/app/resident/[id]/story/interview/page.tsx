"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhotoChoiceGrid, type ChoiceOption } from "@/components/PhotoChoiceGrid";
import { BigButton } from "@/components/shared";

/**
 * T4.4 Story interview page
 * Demonstrates PhotoChoiceGrid for story chapter interviews
 */

interface InterviewQuestion {
  question: string;
  photo_ids: string[];
  labels: string[];
}

const CHAPTER_QUESTIONS: Record<string, InterviewQuestion[]> = {
  about_me: [
    {
      question: "What's a favorite memory?",
      photo_ids: ["photo_bowling", "photo_family", "photo_park"],
      labels: ["Bowling", "Family time", "Park day"],
    },
    {
      question: "Who's important to you?",
      photo_ids: ["photo_sister", "photo_friend", "photo_staff"],
      labels: ["Sister", "Friend", "Staff"],
    },
    {
      question: "What's a goal for this year?",
      photo_ids: ["photo_bowling", "photo_travel", "photo_learning"],
      labels: ["More bowling", "Travel", "Learn something"],
    },
  ],
};

export default function StoryInterviewPage() {
  const router = useRouter();
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  const questions = CHAPTER_QUESTIONS["about_me"];
  const currentQuestion = questions[currentQuestionIdx];

  if (!currentQuestion) {
    return (
      <div className="stack">
        <h2>Interview complete!</h2>
        <p>All questions answered. Review your draft:</p>
        <section className="block">
          <h3>Your Story</h3>
          {questions.map((q, idx) => (
            <p key={idx}>
              <strong>{q.question}</strong>
              <br />
              {answers[idx] || "(no answer)"}
            </p>
          ))}
        </section>
        <div className="story-nav">
          <BigButton
            tone="neutral"
            onClick={() => {
              setCurrentQuestionIdx(0);
              setAnswers({});
            }}
          >
            Start Over
          </BigButton>
          <BigButton
            tone="approve"
            onClick={() => router.push("/resident/marcus/story")}
          >
            View Story
          </BigButton>
        </div>
      </div>
    );
  }

  const options: ChoiceOption[] = currentQuestion.photo_ids.map(
    (photo_id, idx) => ({
      photo_id,
      label: currentQuestion.labels[idx],
    })
  );

  return (
    <div className="stack">
      <PhotoChoiceGrid
        question={currentQuestion.question}
        options={options}
        onChoice={(label) => {
          const newAnswers = { ...answers, [currentQuestionIdx]: label };
          setAnswers(newAnswers);
          // Auto-advance after short delay
          setTimeout(() => {
            if (currentQuestionIdx < questions.length - 1) {
              setCurrentQuestionIdx(currentQuestionIdx + 1);
            } else {
              setCurrentQuestionIdx(questions.length);
            }
          }, 800);
        }}
        onLongPress={(label) => {
          console.log("Long press:", label);
        }}
      />

      <div className="story-nav">
        <BigButton
          onClick={() => {
            if (currentQuestionIdx > 0) {
              setCurrentQuestionIdx(currentQuestionIdx - 1);
            }
          }}
          disabled={currentQuestionIdx === 0}
        >
          ← Back
        </BigButton>
        <span className="eyebrow">
          Question {currentQuestionIdx + 1} of {questions.length}
        </span>
        <BigButton
          onClick={() => {
            if (currentQuestionIdx < questions.length - 1) {
              setCurrentQuestionIdx(currentQuestionIdx + 1);
            } else {
              setCurrentQuestionIdx(questions.length);
            }
          }}
          disabled={!answers[currentQuestionIdx]}
        >
          Next →
        </BigButton>
      </div>
    </div>
  );
}

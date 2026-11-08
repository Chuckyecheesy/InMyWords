"use client";

import { use, useEffect, useRef, useState } from "react";
import { AudioPlayback, BigButton } from "@/components/shared";
import { PhotoChoiceGrid } from "@/components/PhotoChoiceGrid";
import { getStoryAnswers, saveStoryAnswer, speak } from "@/lib/api";
import {
  STORY_CHAPTERS,
  questionsFor,
  type ShowChoicesInput,
  type StoryChapterTemplate,
  type StoryQuestion,
} from "@/lib/story-chapters";

class StepBack extends Error {}

type Waiter = {
  resolve: (label: string) => void;
  reject: (error: Error) => void;
};

/**
 * Picture interview. The same grid serves two callers:
 * - a resident picking one of the seven chapter templates
 * - the Story agent, through window.showChoices(question, options)
 * The promise resolves with the confirmed label. Nothing is narrated here.
 */
export default function StoryInterviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [mode, setMode] = useState<"pick" | "ask" | "review">("pick");
  const [chapter, setChapter] = useState<StoryChapterTemplate | null>(null);
  const [step, setStep] = useState(0);
  const [stepCount, setStepCount] = useState(0);
  const [request, setRequest] = useState<ShowChoicesInput | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [fromAgent, setFromAgent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [review, setReview] = useState<{ question: string; answer: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const waiter = useRef<Waiter | null>(null);
  const runId = useRef(0);

  function begin(next: ShowChoicesInput, agent: boolean) {
    waiter.current?.reject(new Error("replaced"));
    waiter.current = null;
    setFromAgent(agent);
    setRequest(next);
    setPending(null);
    setError(null);
    setMode("ask");
    return new Promise<string>((resolve, reject) => {
      waiter.current = { resolve, reject };
    });
  }

  useEffect(() => {
    window.showChoices = (input: ShowChoicesInput) => {
      runId.current += 1;
      return begin(input, true);
    };
    return () => {
      waiter.current?.reject(new Error("left the interview"));
      waiter.current = null;
      delete window.showChoices;
    };
  }, []);

  async function hear(label: string) {
    const spoken = await speak({ resident_id: id, text: label });
    if (!spoken.ok) {
      setError(spoken.error);
      setAudioSrc(null);
      return;
    }
    setAudioSrc(spoken.data.audio_url);
  }

  async function runChapter(nextChapter: StoryChapterTemplate) {
    const myRun = ++runId.current;
    setChapter(nextChapter);
    const questions = questionsFor(id, nextChapter.chapter_key);
    setStepCount(questions.length);
    let index = 0;
    while (index < questions.length) {
      if (runId.current !== myRun) return;
      setStep(index);
      let label: string;
      try {
        label = await begin(toRequest(questions[index]), false);
      } catch (error) {
        if (error instanceof StepBack) {
          index = Math.max(0, index - 1);
          continue;
        }
        setBusy(false);
        return;
      }
      if (runId.current !== myRun) return;
      setBusy(true);
      const saved = await saveStoryAnswer({
        resident_id: id,
        chapter: nextChapter.chapter_key,
        question: questions[index].question,
        answer: label,
      });
      setBusy(false);
      if (!saved.ok) {
        setError(saved.error);
        continue;
      }
      index += 1;
    }
    if (runId.current !== myRun) return;
    await showReview(nextChapter.chapter_key);
    setBusy(false);
  }

  async function showReview(chapterKey: string) {
    const loaded = await getStoryAnswers(id, chapterKey);
    setReview(loaded.ok ? loaded.data.answers : []);
    setMode("review");
    setRequest(null);
  }

  function confirm() {
    if (!pending || !waiter.current) return;
    const current = waiter.current;
    waiter.current = null;
    if (fromAgent) {
      current.resolve(pending);
      setMode("pick");
      setRequest(null);
      setPending(null);
      setFromAgent(false);
      return;
    }
    current.resolve(pending);
  }

  function back() {
    if (fromAgent || step === 0 || !waiter.current) return;
    const current = waiter.current;
    waiter.current = null;
    current.reject(new StepBack());
  }

  const question = request?.question ?? "";
  const options = request?.options ?? [];

  return (
    <div className="stack">
      {mode === "pick" ? (
        <section className="stack" aria-label="Chapters">
          <h2>Which chapter?</h2>
          <p>One question at a time. Tap a picture to answer.</p>
          <div className="chapter-picker">
            {STORY_CHAPTERS.map((item) => (
              <button
                key={item.chapter_key}
                type="button"
                className="big-button"
                data-chapter={item.chapter_key}
                onClick={() => {
                  void runChapter(item);
                }}
              >
                {item.title}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {mode === "ask" && request ? (
        <>
          <PhotoChoiceGrid
            question={question}
            options={options}
            onChoice={(label) => setPending(label || null)}
            onLongPress={(label) => {
              void hear(label);
            }}
          />
          {audioSrc ? <AudioPlayback src={audioSrc} label="Play the name" autoPlay /> : null}
          <div className="story-nav">
            <BigButton onClick={back} disabled={fromAgent || step === 0 || busy} onLongPress={hear}>
              Back
            </BigButton>
            <span className="eyebrow">
              {fromAgent ? "Story agent" : `Question ${step + 1} of ${stepCount}`}
            </span>
            <BigButton tone="approve" onClick={confirm} disabled={!pending || busy} onLongPress={hear}>
              Save this answer
            </BigButton>
          </div>
        </>
      ) : null}

      {mode === "review" && chapter ? (
        <section className="stack">
          <h2>{chapter.title}</h2>
          <p>Saved. Nothing has been read aloud yet.</p>
          {review.length === 0 ? <p>No answers stored for this chapter.</p> : null}
          <ul className="answer-review">
            {review.map((item, index) => (
              <li key={`${item.question}-${index}`}>
                <strong>{item.question}</strong>
                <br />
                {item.answer}
              </li>
            ))}
          </ul>
          <div className="story-nav">
            <BigButton
              onClick={() => {
                setMode("pick");
                setChapter(null);
                setReview([]);
              }}
            >
              All chapters
            </BigButton>
          </div>
        </section>
      ) : null}

      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

function toRequest(question: StoryQuestion): ShowChoicesInput {
  return { question: question.question, options: question.options };
}

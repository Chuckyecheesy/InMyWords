"use client";

import { use, useEffect, useRef, useState } from "react";
import { AudioPlayback, BigButton, useLongPress } from "@/components/shared";
import { PhotoChoiceGrid } from "@/components/PhotoChoiceGrid";
import { approveStory, draftStory, getStoryAnswers, saveStoryAnswer, speak } from "@/lib/api";
import {
  STORY_CHAPTERS,
  questionsFor,
  type ShowChoicesInput,
  type StoryChapterTemplate,
  type StoryQuestion,
} from "@/lib/story-chapters";
import { startStoryGuide, type GuideStatus, type StoryGuide } from "@/lib/story-agent";

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
  const [mode, setMode] = useState<"pick" | "ask" | "review" | "guide">("pick");
  const [guideOn, setGuideOn] = useState(false);
  const [guideStatus, setGuideStatus] = useState<GuideStatus | null>(null);
  const guide = useRef<StoryGuide | null>(null);
  const [chapter, setChapter] = useState<StoryChapterTemplate | null>(null);
  const [step, setStep] = useState(0);
  const [stepCount, setStepCount] = useState(0);
  const [request, setRequest] = useState<ShowChoicesInput | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [fromAgent, setFromAgent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [review, setReview] = useState<{ question: string; answer: string }[]>([]);
  const [draftText, setDraftText] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<number | null>(null);
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
      void guide.current?.end();
      guide.current = null;
    };
  }, []);

  // T1.4: the Story Interviewer asks the chapter's questions out loud and shows
  // pictures through window.showChoices. It saves each answer itself, so this
  // path never calls saveStoryAnswer. The chapter review and approval stay here.
  async function runGuide(nextChapter: StoryChapterTemplate) {
    runId.current += 1;
    setChapter(nextChapter);
    setError(null);
    setMode("guide");
    const started = await startStoryGuide({
      residentId: id,
      residentName: id.charAt(0).toUpperCase() + id.slice(1),
      chapter: nextChapter,
      onStatus: (status) => {
        setGuideStatus(status);
        if (status === "ended" && guide.current) {
          guide.current = null;
          waiter.current?.reject(new Error("guide ended"));
          waiter.current = null;
          void showReview(nextChapter.chapter_key);
        }
      },
    });
    if (!started) {
      setError("The story guide isn't available right now. You can still tap through the questions.");
      setGuideStatus(null);
      void runChapter(nextChapter);
      return;
    }
    guide.current = started;
  }

  function endGuide() {
    void guide.current?.end();
  }

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
      setMode(guide.current ? "guide" : "pick");
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
          <BigButton onClick={() => setGuideOn((on) => !on)} onLongPress={hear}>
            {guideOn ? "Story guide: on" : "Story guide: off"}
          </BigButton>
          <div className="chapter-picker">
            {STORY_CHAPTERS.map((item) => (
              <ChapterButton
                key={item.chapter_key}
                title={item.title}
                chapterKey={item.chapter_key}
                onSpeak={() => void hear(item.title)}
                onOpen={() => void (guideOn ? runGuide(item) : runChapter(item))}
              />
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

      {mode === "guide" && chapter ? (
        <section className="stack" aria-live="polite">
          <h2>{chapter.title}</h2>
          <p>
            {guideStatus === "starting"
              ? "The story guide is getting ready…"
              : guideStatus === "talking"
                ? "The story guide is talking."
                : guideStatus === "error"
                  ? "The story guide had a problem."
                  : "The story guide is listening. Pictures will show here."}
          </p>
          <BigButton onClick={endGuide} onLongPress={hear}>
            Stop the story guide
          </BigButton>
        </section>
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
          {draftText ? (
            <section className="block">
              <h3>Read this back?</h3>
              <p>{draftText}</p>
              {audioSrc ? <AudioPlayback src={audioSrc} label="Play narration" autoPlay /> : null}
              <div className="story-nav">
                <BigButton
                  tone="approve"
                  disabled={busy || !draftId}
                  onLongPress={hear}
                  onClick={() => {
                    if (!draftId) return;
                    setBusy(true);
                    void approveStory({ chapter_id: draftId }).then((spoken) => {
                      setBusy(false);
                      if (!spoken.ok) {
                        setError(spoken.error);
                        return;
                      }
                      setAudioSrc(spoken.data.audio_url);
                    });
                  }}
                >
                  Yes, read it
                </BigButton>
                <BigButton
                  disabled={busy}
                  onLongPress={hear}
                  onClick={() => {
                    setDraftText(null);
                    setDraftId(null);
                    setAudioSrc(null);
                  }}
                >
                  Not yet
                </BigButton>
              </div>
            </section>
          ) : null}
          <div className="story-nav">
            <BigButton
              disabled={busy}
              onLongPress={hear}
              onClick={() => {
                if (!chapter) return;
                setBusy(true);
                setError(null);
                void draftStory({ resident_id: id, chapter: chapter.chapter_key }).then((result) => {
                  setBusy(false);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setDraftText(result.data.text);
                  setDraftId(result.data.chapter_id);
                  setAudioSrc(null);
                });
              }}
            >
              Make my chapter
            </BigButton>
            <BigButton
              onLongPress={hear}
              onClick={() => {
                setMode("pick");
                setChapter(null);
                setReview([]);
                setDraftText(null);
                setDraftId(null);
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

function ChapterButton({
  title,
  chapterKey,
  onOpen,
  onSpeak,
}: {
  title: string;
  chapterKey: string;
  onOpen: () => void;
  onSpeak: () => void;
}) {
  const press = useLongPress(() => onSpeak(), title);
  return (
    <button
      type="button"
      className="big-button"
      data-chapter={chapterKey}
      onPointerDown={press.onPointerDown}
      onPointerUp={press.onPointerUp}
      onPointerLeave={press.onPointerLeave}
      onPointerCancel={press.onPointerCancel}
      onClick={() => {
        if (press.consumeClick()) return;
        onOpen();
      }}
    >
      {title}
    </button>
  );
}

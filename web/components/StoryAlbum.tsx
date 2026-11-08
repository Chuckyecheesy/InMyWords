"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDashed,
  LayoutGrid,
  Pause,
  Play,
  Plus,
  Volume2,
  X,
} from "lucide-react";
import { approveStory, speak } from "@/lib/api";
import { coverPhoto } from "@/lib/demo-photos";
import type { StoryChapter } from "@/lib/types";
import { ChapterArt } from "./ChapterArt";
import { DeliveredPhoto } from "./DeliveredPhoto";
import { Badge, Progress } from "./ui";

function sentences(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]+["”’)]*\s*|[^.!?]+$/g);
  return parts ? parts.map((part) => part) : [text];
}

/** A real photo from the chapter when there is one, else its illustration. */
function Cover({ chapter }: { chapter: StoryChapter }) {
  const photo = coverPhoto(chapter.photo_ids);
  if (!photo) return <ChapterArt chapterKey={chapter.chapter_key} />;
  return (
    <div className="art">
      <DeliveredPhoto publicId={photo} mode="story" className="tile-img" />
    </div>
  );
}

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Narration = {
  chapterId: string;
  src: string;
  state: "loading" | "playing" | "paused" | "done";
};

export function StoryAlbum({
  residentId,
  name,
  initialChapters,
}: {
  residentId: string;
  name: string;
  initialChapters: StoryChapter[];
}) {
  const [chapters, setChapters] = useState(initialChapters);
  const [view, setView] = useState<number | null>(null);
  const [narration, setNarration] = useState<Narration | null>(null);
  const [progress, setProgress] = useState({ current: 0, duration: 0 });
  const [playAll, setPlayAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCache = useRef(new Map<string, string>());
  const topRef = useRef<HTMLDivElement | null>(null);

  const approved = chapters.filter((chapter) => chapter.status === "approved");
  const chapter = view === null ? null : chapters[view] ?? null;

  useEffect(() => {
    const node = audioRef.current;
    if (!node || !narration) return;
    if (narration.state === "playing") void node.play().catch(() => {});
    if (narration.state === "paused") node.pause();
  }, [narration]);

  useEffect(() => {
    if (view === null) return;
    function onKey(event: KeyboardEvent) {
      if ((event.target as HTMLElement | null)?.closest("input, textarea")) return;
      if (event.key === "ArrowRight") goTo((view ?? 0) + 1);
      if (event.key === "ArrowLeft") goTo((view ?? 0) - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function stopAudio() {
    audioRef.current?.pause();
    setNarration(null);
    setProgress({ current: 0, duration: 0 });
  }

  function goTo(index: number, keepPlaying = false) {
    if (index < 0 || index >= chapters.length) return;
    if (!keepPlaying) {
      stopAudio();
      setPlayAll(false);
    }
    setError(null);
    setNote(null);
    setView(index);
    topRef.current?.scrollIntoView({ block: "start" });
  }

  function backToAlbum() {
    stopAudio();
    setPlayAll(false);
    setView(null);
  }

  async function narrate(target: StoryChapter) {
    setError(null);
    setNarration({ chapterId: target.id, src: "", state: "loading" });
    let src = target.audio_url ?? audioCache.current.get(target.id) ?? null;
    if (!src) {
      const result = await speak({ resident_id: residentId, text: target.text });
      if (!result.ok) {
        setNarration(null);
        setPlayAll(false);
        setError("The voice isn't working right now. You can still read the story.");
        return;
      }
      src = result.data.audio_url;
      audioCache.current.set(target.id, src);
    }
    setProgress({ current: 0, duration: 0 });
    setNarration({ chapterId: target.id, src, state: "playing" });
  }

  function togglePlay(target: StoryChapter) {
    if (narration?.chapterId === target.id && narration.state === "playing") {
      setNarration({ ...narration, state: "paused" });
      return;
    }
    if (narration?.chapterId === target.id && (narration.state === "paused" || narration.state === "done")) {
      if (narration.state === "done" && audioRef.current) audioRef.current.currentTime = 0;
      setNarration({ ...narration, state: "playing" });
      return;
    }
    void narrate(target);
  }

  function playMyStory() {
    const first = chapters.findIndex((item) => item.status === "approved");
    if (first === -1) return;
    setPlayAll(true);
    goTo(first, true);
    void narrate(chapters[first]);
  }

  function onEnded() {
    setNarration((current) => (current ? { ...current, state: "done" } : current));
    if (!playAll || view === null) return;
    const next = chapters.findIndex((item, index) => index > view && item.status === "approved");
    if (next === -1) {
      setPlayAll(false);
      return;
    }
    goTo(next, true);
    void narrate(chapters[next]);
  }

  async function approve(target: StoryChapter) {
    const chapterId = Number(target.id);
    setApproving(true);
    setError(null);
    let audioUrl: string | null = null;
    if (Number.isFinite(chapterId)) {
      const result = await approveStory({ chapter_id: chapterId });
      if (!result.ok) {
        setApproving(false);
        setError("Couldn't save your OK just now. Your chapter is still a draft — try again.");
        return;
      }
      audioUrl = result.data.audio_url ?? null;
    }
    setApproving(false);
    if (audioUrl) audioCache.current.set(target.id, audioUrl);
    setChapters((current) =>
      current.map((item) =>
        item.id === target.id ? { ...item, status: "approved", audio_url: audioUrl ?? item.audio_url } : item,
      ),
    );
    setNote(
      Number.isFinite(chapterId)
        ? `Approved. People can now hear this chapter in ${name}'s voice.`
        : "Approved on this tablet. (Sample chapter — the API isn't connected.)",
    );
  }

  function notYet() {
    stopAudio();
    setView(null);
    setNote("Kept as a draft. Nothing is shared until you say yes.");
  }

  const parts = useMemo(() => (chapter ? sentences(chapter.text) : []), [chapter]);
  const isThisPlaying = chapter !== null && narration?.chapterId === chapter.id;
  const playing = isThisPlaying && narration?.state === "playing";
  const fraction = progress.duration > 0 ? progress.current / progress.duration : 0;
  let currentSentence = -1;
  if (isThisPlaying && narration?.state !== "loading" && chapter) {
    const total = chapter.text.length;
    let running = 0;
    currentSentence = parts.length - 1;
    for (let i = 0; i < parts.length; i += 1) {
      running += parts[i].length;
      if (running / total >= fraction) {
        currentSentence = i;
        break;
      }
    }
  }

  const audio = narration && narration.src ? (
    <audio
      ref={audioRef}
      src={narration.src}
      autoPlay
      onTimeUpdate={(event) =>
        setProgress({ current: event.currentTarget.currentTime, duration: event.currentTarget.duration || 0 })
      }
      onLoadedMetadata={(event) =>
        setProgress({ current: 0, duration: event.currentTarget.duration || 0 })
      }
      onEnded={onEnded}
      onError={() => {
        setNarration(null);
        setPlayAll(false);
        setError("The recording couldn't play. You can still read the story.");
      }}
    />
  ) : null;

  if (chapter && view !== null) {
    const isDraft = chapter.status !== "approved";
    return (
      <div ref={topRef}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: "var(--space-5)" }}>
          <button type="button" className="btn" data-variant="secondary" data-size="lg" onClick={backToAlbum}>
            <LayoutGrid size={22} aria-hidden="true" />
            All chapters
          </button>
          <div className="chapter-dots" role="group" aria-label="Chapters">
            {chapters.map((item, index) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Chapter ${index + 1}: ${item.title}`}
                aria-current={index === view ? "true" : undefined}
                onClick={() => goTo(index)}
              >
                <span />
              </button>
            ))}
          </div>
        </div>

        <article className="chapter-view" aria-labelledby="chapter-title">
          <figure className="chapter-figure" style={{ margin: 0 }}>
            <Cover chapter={chapter} />
            <figcaption>
              {coverPhoto(chapter.photo_ids) ? `From ${name}'s photos.` : `Illustration · ${name} can add photos to this chapter.`}
            </figcaption>
          </figure>

          <div className="chapter-text-col">
            <div className="stack-sm">
              <p className="chapter-num">
                Chapter {view + 1} of {chapters.length}
              </p>
              <h1 id="chapter-title" className="chapter-title">
                {chapter.title}
              </h1>
              <div>
                {isDraft ? (
                  <Badge tone="warning" label={`Draft — waiting for ${name}'s OK`} size="lg" />
                ) : (
                  <Badge tone="resident" label={`In ${name}'s words · approved`} size="lg" />
                )}
              </div>
            </div>

            <p className="chapter-text" data-playing={currentSentence >= 0 ? "" : undefined} aria-live="off">
              {parts.map((part, index) => (
                <span key={index} className={`sent${index === currentSentence ? " is-current" : ""}`}>
                  {part}
                </span>
              ))}
            </p>

            {isDraft ? (
              <section className="approve-panel" aria-labelledby="approve-title">
                <h2 id="approve-title">Is this your story?</h2>
                <p>Only {name} can approve this chapter. Nothing is shared until {name} says yes.</p>
                <div className="row">
                  <button
                    type="button"
                    className="btn"
                    data-variant="secondary"
                    data-size="xl"
                    onClick={() => togglePlay(chapter)}
                    disabled={narration?.state === "loading"}
                  >
                    {narration?.state === "loading" ? (
                      <span className="spinner" aria-hidden="true" />
                    ) : playing ? (
                      <Pause size={24} aria-hidden="true" />
                    ) : (
                      <Volume2 size={24} aria-hidden="true" />
                    )}
                    {playing ? "Pause" : "Hear my draft"}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    data-variant="primary"
                    data-size="xl"
                    onClick={() => void approve(chapter)}
                    disabled={approving}
                  >
                    {approving ? <span className="spinner" aria-hidden="true" /> : <Check size={26} strokeWidth={3} aria-hidden="true" />}
                    Yes, share it
                  </button>
                  <button type="button" className="btn" data-variant="ghost" data-size="xl" onClick={notYet}>
                    <X size={24} aria-hidden="true" />
                    Not yet
                  </button>
                </div>
              </section>
            ) : (
              <section className="narration" aria-label="Narration">
                <div className="narration-row">
                  <button
                    type="button"
                    className="play-btn"
                    onClick={() => togglePlay(chapter)}
                    disabled={narration?.state === "loading"}
                    aria-label={playing ? "Pause" : `Play this chapter in ${name}'s voice`}
                  >
                    {narration?.state === "loading" && isThisPlaying ? (
                      <span className="spinner" style={{ fontSize: 28 }} aria-hidden="true" />
                    ) : playing ? (
                      <Pause size={32} fill="currentColor" aria-hidden="true" />
                    ) : (
                      <Play size={32} fill="currentColor" style={{ marginLeft: 4 }} aria-hidden="true" />
                    )}
                  </button>
                  <div className="narration-meta">
                    <strong>
                      {playing
                        ? `Playing in ${name}'s voice`
                        : narration?.state === "loading" && isThisPlaying
                          ? "Getting the recording ready…"
                          : `Hear it in ${name}'s voice`}
                    </strong>
                    <Progress value={isThisPlaying ? fraction : 0} label="Narration progress" />
                    <div className="narration-time">
                      <span>{clock(isThisPlaying ? progress.current : 0)}</span>
                      <span>{clock(isThisPlaying ? progress.duration : 0)}</span>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {note ? (
              <div className="callout" data-tone="success" role="status">
                <Check size={20} aria-hidden="true" />
                <div className="callout-body">{note}</div>
              </div>
            ) : null}
            {error ? (
              <div className="callout" data-tone="error" role="alert">
                <X size={20} aria-hidden="true" />
                <div className="callout-body">{error}</div>
              </div>
            ) : null}

            <nav className="chapter-nav" aria-label="Chapter navigation">
              <button
                type="button"
                className="btn"
                data-variant="secondary"
                data-size="xl"
                disabled={view === 0}
                onClick={() => goTo(view - 1)}
              >
                <ArrowLeft size={24} aria-hidden="true" />
                Previous
              </button>
              <button
                type="button"
                className="btn"
                data-variant="secondary"
                data-size="xl"
                disabled={view === chapters.length - 1}
                onClick={() => goTo(view + 1)}
              >
                Next
                <ArrowRight size={24} aria-hidden="true" />
              </button>
            </nav>
          </div>
        </article>
        {audio}
      </div>
    );
  }

  return (
    <div ref={topRef}>
      <header className="story-hero">
        <div>
          <h1>My Story</h1>
          <p className="lead">
            In {name}&apos;s own words. {approved.length} of {chapters.length} chapters shared.
          </p>
        </div>
        <div className="story-hero-actions">
          <Link prefetch={false} href={`/resident/${residentId}/story/interview`} className="btn" data-variant="secondary" data-size="xl">
            <Plus size={24} aria-hidden="true" />
            Add to my story
          </Link>
          <button
            type="button"
            className="btn"
            data-variant="ink"
            data-size="xl"
            onClick={playMyStory}
            disabled={approved.length === 0}
          >
            <Play size={24} fill="currentColor" aria-hidden="true" />
            Play my story
          </button>
        </div>
      </header>

      {note ? (
        <div className="callout" data-tone="calm" role="status" style={{ marginBottom: "var(--space-5)" }}>
          <CircleDashed size={20} aria-hidden="true" />
          <div className="callout-body">{note}</div>
        </div>
      ) : null}
      {error ? (
        <div className="callout" data-tone="error" role="alert" style={{ marginBottom: "var(--space-5)" }}>
          <X size={20} aria-hidden="true" />
          <div className="callout-body">{error}</div>
        </div>
      ) : null}
      {approved.length === 0 && chapters.length > 0 ? (
        <div className="callout" style={{ marginBottom: "var(--space-5)" }}>
          <CircleDashed size={20} aria-hidden="true" />
          <div className="callout-body">
            Nothing is shared yet. Open a chapter and tap <strong>Yes, share it</strong> when it sounds right.
          </div>
        </div>
      ) : null}

      <div className="chapter-grid">
        {chapters.map((item, index) => (
          <button key={item.id} type="button" className="chapter-card" onClick={() => goTo(index)}>
            <Cover chapter={item} />
            <div className="chapter-card-body">
              <p className="chapter-num">Chapter {index + 1}</p>
              <h2>{item.title}</h2>
              <p>{item.text}</p>
              <div>
                {item.status === "approved" ? (
                  <Badge tone="resident" label="Shared" />
                ) : (
                  <Badge tone="warning" label="Draft" />
                )}
              </div>
            </div>
          </button>
        ))}
        <Link prefetch={false} href={`/resident/${residentId}/story/interview`} className="chapter-add">
          <span className="empty-icon" aria-hidden="true">
            <Plus size={30} />
          </span>
          Add a new chapter
          <span className="muted" style={{ fontWeight: 400, fontSize: "var(--text-small)" }}>
            Answer with pictures. No typing.
          </span>
        </Link>
      </div>
      {audio}
    </div>
  );
}

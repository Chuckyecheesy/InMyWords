import { AudioPlayback } from "./shared";
import type { StoryChapter } from "@/lib/types";

function chapterPhoto(publicId: string): string {
  const cloud =
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
    process.env.CLOUDINARY_CLOUD_NAME ||
    "inmywords";
  const id = publicId.replace(/^\/+/, "");
  return `https://res.cloudinary.com/${cloud}/image/upload/c_fill,g_auto,w_800,h_400/${id}`;
}

export function Story({ chapters }: { chapters: StoryChapter[] }) {
  if (chapters.length === 0) {
    return (
      <div className="story-page">
        <div className="story-empty">
          <h2>Your Story</h2>
          <p>No chapters yet. Complete an interview to build your story.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="story-page">
      <h1>Your Story</h1>
      {chapters.map((chapter) => (
        <article key={chapter.id} className="story-chapter">
          {chapter.photo_ids.length > 0 ? (
            <picture>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="story-chapter-photo"
                src={chapterPhoto(chapter.photo_ids[0])}
                alt=""
              />
            </picture>
          ) : null}
          <div className="story-chapter-content">
            <h2 className="story-chapter-title">{chapter.title}</h2>
            <p className="story-chapter-status">
              {chapter.status === "approved" ? "Approved" : "Draft"}
            </p>
            <p className="story-chapter-text">{chapter.text}</p>
            {chapter.audio_url ? (
              <div className="story-audio">
                <AudioPlayback
                  src={chapter.audio_url}
                  label="Play narration"
                  autoPlay={false}
                />
              </div>
            ) : chapter.status === "approved" ? (
              <p className="note">Narration is being generated.</p>
            ) : (
              <p className="note">Narration will be available after approval.</p>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

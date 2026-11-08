import Link from "next/link";
import { notFound } from "next/navigation";
import { getResident, getStory } from "@/lib/api";
import { tileImageUrl } from "@/lib/cloudinary";
import { AudioPlayback } from "@/components/shared";

export const metadata = { title: "Story" };

interface StoryChapter {
  id: string | number;
  chapter_key: string;
  title?: string;
  text: string;
  status: "draft" | "approved";
  audio_url?: string;
  photo_ids?: string[];
}

interface StoryResponse {
  data: StoryChapter[];
}

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();
  const storyResponse = (await getStory(id)) as StoryResponse;
  const chapters: StoryChapter[] = storyResponse.data || [];

  return (
    <div className="story-page">
      <p>
        <Link className="big-button" href={`/resident/${id}/story/interview`}>
          Answer with pictures
        </Link>
      </p>
      {chapters.length === 0 ? (
        <div className="story-empty">
          <h2>Your Story</h2>
          <p>No chapters yet. Complete an interview to build your story.</p>
        </div>
      ) : (
        <>
          <h2>Your Story</h2>
          {chapters.map((chapter) => {
            const photoId = chapter.photo_ids?.[0];
            const photoUrl = photoId ? tileImageUrl(photoId, "calm") : null;
            return (
            <article key={chapter.id} className="story-chapter">
              {photoUrl ? (
                <picture>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="story-chapter-photo" src={photoUrl} alt="" />
                </picture>
              ) : null}

              <div className="story-chapter-content">
                <h2 className="story-chapter-title">
                  {chapter.title || chapter.chapter_key}
                </h2>
                <p className="story-chapter-status">
                  {chapter.status === "approved" ? "✓ Approved" : "○ Draft"}
                </p>

                {/* Chapter text (first-person narrative) */}
                <p className="story-chapter-text">{chapter.text}</p>

                {/* Audio playback (narration in resident's voice) */}
                {chapter.audio_url ? (
                  <div className="story-audio">
                    <AudioPlayback
                      src={chapter.audio_url}
                      label="▶ Play Narration"
                      autoPlay={false}
                    />
                  </div>
                ) : chapter.status === "approved" ? (
                  <p className="note">Narration is being generated...</p>
                ) : (
                  <p className="note">Narration will be available after approval.</p>
                )}
              </div>
            </article>
            );
          })}
        </>
      )}
    </div>
  );
}

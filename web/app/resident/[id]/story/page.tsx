import { notFound } from "next/navigation";
import { getResident, getStory } from "@/lib/api";

export const metadata = { title: "Story" };

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();
  const story = await getStory(id);

  return (
    <div className="stack">
      {story.data.length === 0 ? (
        <p>No chapters yet.</p>
      ) : (
        story.data.map((chapter) => (
          <article key={chapter.id} className="block">
            <h2>{chapter.title}</h2>
            <p className="eyebrow">{chapter.status === "approved" ? "Approved" : "Draft"}</p>
            <p>{chapter.text}</p>
            {chapter.audio_url ? (
              <audio controls src={chapter.audio_url} preload="none">
                Narration
              </audio>
            ) : (
              <p className="note">Narration plays here after the chapter is approved.</p>
            )}
          </article>
        ))
      )}
    </div>
  );
}

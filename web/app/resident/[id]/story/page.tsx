import { notFound } from "next/navigation";
import { BookOpen } from "lucide-react";
import Link from "next/link";
import { StoryAlbum } from "@/components/StoryAlbum";
import { EmptyState } from "@/components/ui";
import { getResident, getStory } from "@/lib/api";

export const metadata = { title: "My Story" };

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();
  const story = await getStory(id);

  if (story.data.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen size={30} />}
        title="Your story starts here"
        action={
          <Link prefetch={false} href={`/resident/${id}/story/interview`} className="btn" data-variant="primary" data-size="xl">
            Start my first chapter
          </Link>
        }
      >
        Answer a few questions with pictures. You choose what goes in, and nothing is shared until you say yes.
      </EmptyState>
    );
  }

  return <StoryAlbum residentId={id} name={resident.data.name} initialChapters={story.data} />;
}

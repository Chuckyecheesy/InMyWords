import { notFound } from "next/navigation";
import { Story } from "@/components/Story";
import { getResident, getStory } from "@/lib/api";

export const metadata = { title: "Story" };

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();
  const story = await getStory(id);

  return <Story chapters={story.data} />;
}

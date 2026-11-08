import { notFound } from "next/navigation";
import { SpeakForMe } from "@/components/SpeakForMe";
import { getResident } from "@/lib/api";

export const metadata = { title: "My own words" };

/** The full Speak For Me composer: the resident's own tiles, suggestions,
 *  and approval. The quick category speaker is the simple default on
 *  /speak; this screen is the never-cut full vocabulary (CLAUDE.md §12). */
export default async function SpeakWordsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();
  return <SpeakForMe resident={resident.data} />;
}

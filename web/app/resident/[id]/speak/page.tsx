import { notFound } from "next/navigation";
import { CategorySpeaker } from "@/components/CategorySpeaker";
import { getResident } from "@/lib/api";

export const metadata = { title: "Speak For Me" };

export default async function SpeakPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();
  return <CategorySpeaker key={id} residentId={id} />;
}

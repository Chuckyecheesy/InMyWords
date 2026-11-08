import { notFound } from "next/navigation";
import { GuidedBuilder } from "@/components/GuidedBuilder";
import { getResident } from "@/lib/api";

export const metadata = { title: "Guide me" };

export default async function GuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();
  return <GuidedBuilder resident={resident.data} />;
}

import { notFound } from "next/navigation";
import { VoicePicker } from "@/components/VoicePicker";
import { getResident } from "@/lib/api";

export const metadata = { title: "Voice" };

export default async function VoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();

  return <VoicePicker residentId={id} residentName={resident.data.name} />;
}
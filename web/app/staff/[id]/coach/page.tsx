import { getResident } from "@/lib/api";
import { notFound } from "next/navigation";
import { CoachChat } from "@/components/CoachChat";
import { CoachVoice } from "@/components/CoachVoice";

export const metadata = { title: "Coach" };

export default async function CoachPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();

  return (
    <div className="stack">
      <div className="coach-header">
        <h2>Ask the Coach</h2>
        <p className="eyebrow">
          Ask questions about {resident.data.name}. Every answer shows its source.
        </p>
      </div>

      <CoachChat residentName={resident.data.name} residentId={resident.data.id} />

      <CoachVoice residentId={id} residentName={resident.data.name} />
    </div>
  );
}

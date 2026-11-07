import { notFound } from "next/navigation";
import { getResident } from "@/lib/api";

export const metadata = { title: "Voice" };

export default async function VoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();

  return (
    <div className="stack">
      <section className="block">
        <h2>Choose a voice</h2>
        {resident.data.voice_id ? (
          <p>Current voice: {resident.data.voice_id}</p>
        ) : (
          <p>No voice chosen yet.</p>
        )}
        <p>Three previews will show here, and {resident.data.name} picks one.</p>
      </section>
    </div>
  );
}

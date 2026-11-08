import { notFound } from "next/navigation";
import { ConfirmQueue } from "@/components/ConfirmQueue";
import { getPendingMemories, getResident } from "@/lib/api";

export const metadata = { title: "Confirm" };

export default async function ConfirmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();
  const pending = await getPendingMemories(id);

  return (
    <div className="stack">
      <section className="block">
        <h2>Is this still true?</h2>
        <ConfirmQueue residentName={resident.data.name} residentId={resident.data.id} memories={pending.data} />
      </section>
    </div>
  );
}

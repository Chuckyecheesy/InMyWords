import { notFound } from "next/navigation";
import { ConfirmQueue } from "@/components/ConfirmQueue";
import { getPendingMemories, getResident } from "@/lib/api";

export const metadata = { title: "Is this still true?" };

export default async function ConfirmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();
  const pending = await getPendingMemories(id);

  return (
    <div className="stack">
      <header className="page-head">
        <p className="eyebrow">Is this still true?</p>
        <h1>Things people noticed</h1>
        <p className="lead">
          Only {resident.data.name} can say if these are true. Nothing becomes {resident.data.name}&apos;s words until then.
        </p>
      </header>
      <ConfirmQueue residentName={resident.data.name} residentId={resident.data.id} memories={pending.data} />
    </div>
  );
}

import { notFound } from "next/navigation";
import { SourceChip } from "@/components/SourceChip";
import { getPendingMemories, getResident } from "@/lib/api";
import { sourceChip } from "@/lib/format";

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
        {pending.data.length === 0 ? (
          <p>Nothing is waiting for {resident.data.name} to confirm.</p>
        ) : (
          pending.data.map((memory) => {
            const chip = sourceChip(memory.source, resident.data.name, memory.source_date);
            return (
              <article key={memory.id} className="fact">
                <p>{memory.content}</p>
                <SourceChip tone={chip.tone} label={chip.label} />
                <p className="note">{resident.data.name} confirms this with yes or no.</p>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}

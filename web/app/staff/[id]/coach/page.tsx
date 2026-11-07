import { notFound } from "next/navigation";
import { DataBanner } from "@/components/DataBanner";
import { SourceChip } from "@/components/SourceChip";
import { getResident } from "@/lib/api";
import { sourceChip } from "@/lib/format";
import { sampleCoach } from "@/lib/mock";

export const metadata = { title: "Coach" };

export default async function CoachPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();
  const coach = sampleCoach(id);

  return (
    <div className="stack">
      <DataBanner>Sample answer. Asking the Coach is not connected yet.</DataBanner>
      {coach ? (
        <section className="block">
          <h2>Ask</h2>
          <p className="fact">{coach.question}</p>
          <article className="fact">
            <p>{coach.answer}</p>
            <div className="chips">
              {coach.sources.map((source) => {
                const chip = sourceChip(source.type, resident.data.name, source.date);
                return <SourceChip key={chip.label} tone={chip.tone} label={chip.label} />;
              })}
            </div>
          </article>
        </section>
      ) : (
        <p>No sample question for this resident.</p>
      )}
    </div>
  );
}

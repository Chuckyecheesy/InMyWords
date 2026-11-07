import { notFound } from "next/navigation";
import { SourceChip } from "@/components/SourceChip";
import { getResident, getStory } from "@/lib/api";
import { sourceChip } from "@/lib/format";
import { sampleEssentials, sampleRoutines } from "@/lib/mock";

export const metadata = { title: "Onboarding" };

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();
  const story = await getStory(id);
  const essentials = sampleEssentials(id);
  const routines = sampleRoutines(id);

  return (
    <div className="stack">
      <ol className="steps">
        <li>
          <a href="#essentials">Essentials</a>
        </li>
        <li>
          <a href="#story">Story</a>
        </li>
        <li>
          <a href="#routines">Routines</a>
        </li>
      </ol>
      <section id="essentials" className="block">
        <h2>Essentials</h2>
        <p>{resident.data.communication_style}</p>
        <p className="note">Sample facts for the demo.</p>
        {essentials.map((fact) => {
          const chip = sourceChip(fact.source, resident.data.name, fact.date);
          return (
            <article key={fact.text} className="fact">
              <p>{fact.text}</p>
              <SourceChip tone={chip.tone} label={chip.label} />
            </article>
          );
        })}
      </section>
      <section id="story" className="block">
        <h2>Story</h2>
        {story.data.length === 0 ? (
          <p>No chapters yet.</p>
        ) : (
          story.data.map((chapter) => (
            <article key={chapter.id} className="fact">
              <h3>{chapter.title}</h3>
              <p>{chapter.text}</p>
              <p className="eyebrow">{chapter.status === "approved" ? "Approved" : "Draft"}</p>
            </article>
          ))
        )}
      </section>
      <section id="routines" className="block">
        <h2>Routines</h2>
        <p className="note">Sample facts for the demo.</p>
        {routines.length === 0 ? (
          <p>No routines yet.</p>
        ) : (
          routines.map((fact) => {
            const chip = sourceChip(fact.source, resident.data.name, fact.date);
            return (
              <article key={fact.text} className="fact">
                <p>{fact.text}</p>
                <SourceChip tone={chip.tone} label={chip.label} />
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}

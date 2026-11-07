import { notFound } from "next/navigation";
import { DataBanner } from "@/components/DataBanner";
import { getResident } from "@/lib/api";
import { choiceStanding, consequence, money } from "@/lib/format";
import { sampleChoice } from "@/lib/mock";

export const metadata = { title: "Choice" };

export default async function ChoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();
  const choice = sampleChoice(id);

  return (
    <div className="stack">
      <DataBanner>Sample choice. Nothing is saved from this screen yet.</DataBanner>
      {choice ? (
        <section className="block">
          <h2>{choice.question}</h2>
          {choice.weekly_budget != null ? (
            <p>Weekly budget {money(choice.weekly_budget)}.</p>
          ) : null}
          {choice.options.map((option) => (
            <article key={option.label} className="option">
              <h3>{option.label}</h3>
              <p>{consequence(option.cost, choice.weekly_budget)}</p>
            </article>
          ))}
          <p className="eyebrow">
            {choiceStanding(choice.status, resident.data.name, choice.chosen)}
          </p>
        </section>
      ) : (
        <p>No choice is open.</p>
      )}
    </div>
  );
}

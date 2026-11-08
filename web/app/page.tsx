import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { DataBanner } from "@/components/DataBanner";
import { SourceChip } from "@/components/SourceChip";
import { getResident } from "@/lib/api";
import { sourceChip } from "@/lib/format";
import { DEMO_RESIDENT_IDS, openingLine } from "@/lib/mock";

export default async function HomePage() {
  const people = (
    await Promise.all(DEMO_RESIDENT_IDS.map((id) => getResident(id)))
  ).filter((person) => person !== null);
  const sample = people.some((person) => person.origin === "sample");

  return (
    <AppShell title="Your story, told once, in your own voice.">
      {sample ? (
        <DataBanner>
          Sample data. The API did not answer, so these are the demo residents.
        </DataBanner>
      ) : null}
      <div className="person-grid">
        {people.map(({ data }) => {
          const line = openingLine(data.id);
          const chip = line ? sourceChip(line.source, data.name, line.date) : null;
          return (
            <Link key={data.id} href={`/resident/${data.id}`} className="person-card">
              <h2>{data.name}</h2>
              <p>{data.communication_style}</p>
              {line && chip ? (
                <>
                  <p>{line.text}</p>
                  <SourceChip tone={chip.tone} label={chip.label} />
                </>
              ) : null}
              <span className="card-action">Open home</span>
            </Link>
          );
        })}
      </div>
      <Link href="/staff" className="big-link">
        I&apos;m staff
      </Link>
    </AppShell>
  );
}

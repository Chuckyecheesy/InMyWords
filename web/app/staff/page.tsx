import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { DataBanner } from "@/components/DataBanner";
import { SourceChip } from "@/components/SourceChip";
import { getResident } from "@/lib/api";
import { sourceChip } from "@/lib/format";
import { DEMO_RESIDENT_IDS, openingLine } from "@/lib/mock";

export const metadata = { title: "Staff" };

export default async function StaffPage() {
  const people = (
    await Promise.all(DEMO_RESIDENT_IDS.map((id) => getResident(id)))
  ).filter((person) => person !== null);
  const sample = people.some((person) => person.origin === "sample");

  return (
    <AppShell
      eyebrow="Staff"
      title="Who are you here for?"
      backHref="/"
      backLabel="Home"
    >
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
            <Link
              key={data.id}
              href={`/staff/${data.id}/onboarding`}
              className="person-card"
            >
              <h2>{data.name}</h2>
              <p>{data.communication_style}</p>
              {line && chip ? (
                <>
                  <p>{line.text}</p>
                  <SourceChip tone={chip.tone} label={chip.label} />
                </>
              ) : null}
              <span className="card-action">Start onboarding</span>
            </Link>
          );
        })}
      </div>
      <nav className="nav" aria-label="Staff tools">
        <Link href="/staff/handoff">Since last shift</Link>
        <Link href="/staff/activity">Activity log</Link>
      </nav>
      <Link href="/manager" className="text-link">
        Manager view
      </Link>
    </AppShell>
  );
}

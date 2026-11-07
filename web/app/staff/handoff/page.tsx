import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { DataBanner } from "@/components/DataBanner";
import { SourceChip } from "@/components/SourceChip";
import { StaffNav } from "@/components/StaffNav";
import { getHandoff, getResident } from "@/lib/api";
import { handoffChip } from "@/lib/format";
import { DEMO_RESIDENT_IDS, DEMO_STAFF } from "@/lib/mock";

export const metadata = { title: "Since last shift" };

export default async function HandoffPage({
  searchParams,
}: {
  searchParams: Promise<{ resident?: string }>;
}) {
  const { resident: requested } = await searchParams;
  const people = (
    await Promise.all(DEMO_RESIDENT_IDS.map((id) => getResident(id)))
  ).filter((person) => person !== null);
  const person =
    people.find((item) => item.data.id === requested?.toLowerCase()) ?? people[0];
  if (!person) return null;
  const handoff = await getHandoff(DEMO_STAFF.id, person.data.id);
  const sample = person.origin === "sample" || handoff.origin === "sample";

  return (
    <AppShell
      eyebrow="Staff"
      title="Since last shift"
      lede={`For ${DEMO_STAFF.name}`}
      backHref="/staff"
      backLabel="All residents"
    >
      {sample ? (
        <DataBanner>
          Sample data. The API did not answer, so this is the demo handoff.
        </DataBanner>
      ) : null}
      <nav className="switch" aria-label="Choose a resident">
        {people.map((item) => (
          <Link
            key={item.data.id}
            href={`/staff/handoff?resident=${item.data.id}`}
            aria-current={item.data.id === person.data.id ? "page" : undefined}
          >
            {item.data.name}
          </Link>
        ))}
      </nav>
      <StaffNav id={person.data.id} />
      <div className="stack">
        {handoff.data.length === 0 ? (
          <p>Nothing new since the last shift.</p>
        ) : (
          handoff.data.map((item) => {
            const chip = handoffChip(item, person.data.name);
            return (
              <article key={`${item.type}-${item.date}-${item.text}`} className="fact">
                <p>{item.text}</p>
                <SourceChip tone={chip.tone} label={chip.label} />
              </article>
            );
          })
        )}
      </div>
    </AppShell>
  );
}

import Link from "next/link";
import { ActivityLog } from "@/components/ActivityLog";
import { AppShell } from "@/components/AppShell";
import { DataBanner } from "@/components/DataBanner";
import { StaffNav } from "@/components/StaffNav";
import { getActivity, getResident } from "@/lib/api";
import { DEMO_RESIDENT_IDS } from "@/lib/mock";

export const metadata = { title: "Activity" };

export default async function ActivityPage({
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
  const activity = await getActivity(person.data.id);
  const sample = person.origin === "sample" || activity.origin === "sample";

  return (
    <AppShell
      eyebrow="Staff"
      title="Activity log"
      lede={person.data.name}
      backHref="/staff"
      backLabel="All residents"
    >
      {sample ? (
        <DataBanner>
          Sample data. The API did not answer, so this is the demo log.
        </DataBanner>
      ) : null}
      <nav className="switch" aria-label="Choose a resident">
        {people.map((item) => (
          <Link
            key={item.data.id}
            href={`/staff/activity?resident=${item.data.id}`}
            aria-current={item.data.id === person.data.id ? "page" : undefined}
          >
            {item.data.name}
          </Link>
        ))}
      </nav>
      <StaffNav id={person.data.id} />
      <ActivityLog items={activity.data} residentName={person.data.name} />
    </AppShell>
  );
}

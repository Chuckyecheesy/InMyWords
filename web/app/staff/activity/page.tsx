import Link from "next/link";
import { DataBanner } from "@/components/DataBanner";
import { StaffNav } from "@/components/StaffNav";
import { ActivityLog } from "@/components/ActivityLog";
import { Avatar, StaffHead } from "@/components/ui";
import { getActivity, getResident } from "@/lib/api";
import { DEMO_RESIDENT_IDS } from "@/lib/mock";

export const metadata = { title: "Activity" };

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ resident?: string }>;
}) {
  const { resident: requested } = await searchParams;
  const people = (await Promise.all(DEMO_RESIDENT_IDS.map((id) => getResident(id)))).filter(
    (person) => person !== null,
  );
  const person = people.find((item) => item.data.id === requested?.toLowerCase()) ?? people[0];
  if (!person) return null;
  const activity = await getActivity(person.data.id);
  const sample = person.origin === "sample" || activity.origin === "sample";
  const name = person.data.name;

  return (
    <>
      <StaffHead eyebrow="Log" title="Activity log">
        Everything {name} said, chose or approved through the app — logged as it happened.
      </StaffHead>
      {sample ? (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <DataBanner>Sample data — the API didn&apos;t answer, so this is the demo log.</DataBanner>
        </div>
      ) : null}
      <nav className="switch" aria-label="Choose a resident">
        {people.map((item, index) => (
          <Link
            key={item.data.id}
            href={`/staff/activity?resident=${item.data.id}`}
            aria-current={item.data.id === person.data.id ? "page" : undefined}
          >
            <Avatar name={item.data.name} size="sm" tone={index === 1 ? "coral" : undefined} />
            {item.data.name}
          </Link>
        ))}
      </nav>
      <StaffNav id={person.data.id} />
      <ActivityLog items={activity.data} residentName={name} />
    </>
  );
}

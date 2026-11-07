import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { DataBanner } from "@/components/DataBanner";
import { StaffNav } from "@/components/StaffNav";
import { getActivity, getResident } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { DEMO_RESIDENT_IDS } from "@/lib/mock";
import type { ActivityItem } from "@/lib/types";

export const metadata = { title: "Activity" };

const KIND_LABEL: Record<ActivityItem["kind"], string> = {
  sentence: "Sentence",
  choice: "Choice",
  action: "Action",
};

function standing(item: ActivityItem, name: string): string {
  if (item.status === "not_yet_decided") return "Not decided yet.";
  if (item.kind === "choice" && item.status === "chosen") return `${name} chose this.`;
  if (item.status === "approved") return "Approved.";
  if (!item.status) return "";
  return item.status.replaceAll("_", " ");
}

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
      <div className="stack">
        {activity.data.length === 0 ? (
          <p>Nothing has been logged yet.</p>
        ) : (
          activity.data.map((item) => (
            <article key={`${item.kind}-${item.created_at}-${item.text}`} className="fact">
              <p className="eyebrow">{KIND_LABEL[item.kind]}</p>
              <p>{item.text}</p>
              <p>
                {formatWhen(item.created_at)}
                {standing(item, person.data.name) ? ` · ${standing(item, person.data.name)}` : ""}
              </p>
            </article>
          ))
        )}
      </div>
    </AppShell>
  );
}

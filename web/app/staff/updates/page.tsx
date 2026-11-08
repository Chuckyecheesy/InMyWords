import Link from "next/link";
import { Suspense } from "react";
import { History } from "lucide-react";
import { DataBanner } from "@/components/DataBanner";
import { LoadingNotice } from "@/components/LoadingNotice";
import { StaffNav } from "@/components/StaffNav";
import { Avatar, Badge, EmptyState, SourceBadge, StaffHead } from "@/components/ui";
import { getActivity, getHandoff, getResident } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { DEMO_RESIDENT_IDS, DEMO_STAFF } from "@/lib/mock";
import type { SourceType } from "@/lib/types";

export const metadata = { title: "Updates" };

/** Roadmap Phase 3: one page for everything that changed. "Since my last
 *  shift" and the activity log merged into a single, deduped feed. */

type Update = {
  type: string;
  date: string;
  text: string;
  source?: SourceType;
};

const FILTERS = [
  { key: "all", label: "Everything" },
  { key: "shift", label: "Shift notes & routines" },
  { key: "said", label: "What they said" },
  { key: "actions", label: "Actions & bookings" },
] as const;

const SHIFT_TYPES = new Set(["emh", "checklist", "observation", "task", "memory", "choice"]);

function matches(filter: string, update: Update): boolean {
  if (filter === "shift") return SHIFT_TYPES.has(update.type);
  if (filter === "said") return update.type === "sentence";
  if (filter === "actions") return update.type === "action";
  return true;
}

function byDay(items: Update[]): [string, Update[]][] {
  const days = new Map<string, Update[]>();
  for (const item of [...items].sort((a, b) => b.date.localeCompare(a.date))) {
    const key = item.date.slice(0, 10) || "open";
    days.set(key, [...(days.get(key) ?? []), item]);
  }
  return [...days.entries()];
}

export default async function UpdatesPage({
  searchParams,
}: {
  searchParams: Promise<{ resident?: string; type?: string }>;
}) {
  const { resident: requested, type } = await searchParams;
  const filter = FILTERS.some((f) => f.key === type) ? (type as string) : "all";
  const people = (await Promise.all(DEMO_RESIDENT_IDS.map((id) => getResident(id)))).filter(
    (person) => person !== null,
  );
  const person = people.find((item) => item.data.id === requested?.toLowerCase()) ?? people[0];
  if (!person) return null;

  return (
    <>
      <StaffHead eyebrow={`For ${DEMO_STAFF.name}`} title="Updates">
        Everything that changed for {person.data.name}: shift notes, routines, choices,
        what they said, and actions. One feed, newest first.
      </StaffHead>

      <nav className="switch" aria-label="Choose a resident">
        {people.map((item, index) => (
          <Link
            key={item.data.id}
            href={`/staff/updates?resident=${item.data.id}&type=${filter}`}
            aria-current={item.data.id === person.data.id ? "page" : undefined}
          >
            <Avatar name={item.data.name} size="sm" tone={index === 1 ? "coral" : undefined} />
            {item.data.name}
          </Link>
        ))}
      </nav>
      <StaffNav id={person.data.id} />

      <nav className="switch" aria-label="Filter updates">
        {FILTERS.map((item) => (
          <Link
            key={item.key}
            href={`/staff/updates?resident=${person.data.id}&type=${item.key}`}
            aria-current={item.key === filter ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <Suspense
        key={`${person.data.id}-${filter}`}
        fallback={<LoadingNotice message="Loading updates…" />}
      >
        <UpdatesFeed residentId={person.data.id} residentName={person.data.name} filter={filter} />
      </Suspense>
    </>
  );
}

async function UpdatesFeed({
  residentId,
  residentName: name,
  filter,
}: {
  residentId: string;
  residentName: string;
  filter: string;
}) {
  const [handoff, activity] = await Promise.all([
    getHandoff(DEMO_STAFF.id, residentId),
    getActivity(residentId),
  ]);
  const sample = handoff.origin === "sample" || activity.origin === "sample";

  const updates: Update[] = handoff.data.map((item) => ({
    type: item.type,
    date: item.date,
    text: item.text,
    source: item.source,
  }));
  // Dedupe: the handoff already carries choices and staff tasks, so the
  // activity feed contributes only sentences and action results that are
  // not simple restatements of a staff task.
  for (const item of activity.data) {
    if (item.kind === "choice") continue;
    if (item.kind === "action" && item.text.startsWith("Staff task created")) continue;
    updates.push({ type: item.kind, date: item.created_at, text: item.text });
  }

  const visible = updates.filter((update) => matches(filter, update));

  return (
    <>
      {sample ? (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <DataBanner>Sample data, the API didn&apos;t answer, so this is the demo feed.</DataBanner>
        </div>
      ) : null}
      {visible.length === 0 ? (
        <EmptyState icon={<History size={30} />} title="Nothing new here">
          No {filter === "all" ? "updates" : FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} for {name} right now.
        </EmptyState>
      ) : (
        <div className="stack">
          {byDay(visible).map(([day, items]) => (
            <section key={day} className="card card-pad" aria-label={day === "open" ? "Open items" : formatDay(day)}>
              <h2 className="eyebrow">{day === "open" ? "Open items" : formatDay(day)}</h2>
              <ul style={{ listStyle: "none", display: "grid", gap: "var(--space-3)" }}>
                {items.map((update, index) => (
                  <li key={`${update.type}-${index}`} className="row" style={{ alignItems: "flex-start", gap: "var(--space-3)" }}>
                    <Badge tone="neutral" label={update.type} />
                    <div>
                      <p style={{ margin: 0 }}>{update.text}</p>
                      {update.source ? (
                        <SourceBadge source={update.source} name={name} date={update.date || null} />
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

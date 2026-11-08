import Link from "next/link";
import { Suspense } from "react";
import { LoadingNotice } from "@/components/LoadingNotice";
import { CircleCheck, CircleX, Eye, History, UserRound } from "lucide-react";
import { DataBanner } from "@/components/DataBanner";
import { handoffKind } from "@/components/HandoffBits";
import { StaffNav } from "@/components/StaffNav";
import { Avatar, EmptyState, SourceBadge, StaffHead } from "@/components/ui";
import { getHandoff, getResident } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { DEMO_RESIDENT_IDS, DEMO_STAFF } from "@/lib/mock";
import type { HandoffItem } from "@/lib/types";

export const metadata = { title: "Since last shift" };

const WEEKDAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", weekday: "long" });

function byDay(items: HandoffItem[]): [string, HandoffItem[]][] {
  const days = new Map<string, HandoffItem[]>();
  for (const item of [...items].sort((a, b) => b.date.localeCompare(a.date))) {
    const key = item.date.slice(0, 10);
    days.set(key, [...(days.get(key) ?? []), item]);
  }
  return [...days.entries()];
}

export default async function HandoffPage({
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
  const sample = person.origin === "sample";

  return (
    <>
      <StaffHead eyebrow={`For ${DEMO_STAFF.name}`} title="Since last shift">
        This is your first shift, so you&apos;re seeing the last two weeks. Grounded in EMH shift notes and checklists.
      </StaffHead>

      {sample ? (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <DataBanner>Sample data — the API didn&apos;t answer, so these are the demo residents.</DataBanner>
        </div>
      ) : null}

      <nav className="switch" aria-label="Choose a resident">
        {people.map((item, index) => (
          <Link
            key={item.data.id}
            href={`/staff/handoff?resident=${item.data.id}`}
            aria-current={item.data.id === person.data.id ? "page" : undefined}
          >
            <Avatar name={item.data.name} size="sm" tone={index === 1 ? "coral" : undefined} />
            {item.data.name}
          </Link>
        ))}
      </nav>
      <StaffNav id={person.data.id} />
      <Suspense
        key={person.data.id}
        fallback={<LoadingNotice message="Loading updates since your last shift…" />}
      >
        <HandoffItems residentId={person.data.id} residentName={person.data.name} />
      </Suspense>
    </>
  );
}

async function HandoffItems({
  residentId,
  residentName: name,
}: {
  residentId: string;
  residentName: string;
}) {
  const handoff = await getHandoff(DEMO_STAFF.id, residentId);
  const kinds = handoff.data.map(handoffKind);
  const count = (keys: string[]) => kinds.filter((kind) => keys.includes(kind.key)).length;

  return (
    <>
      {handoff.origin === "sample" ? (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <DataBanner>Sample data — the API didn&apos;t answer, so this is the demo handoff.</DataBanner>
        </div>
      ) : null}
      {handoff.data.length === 0 ? (
        <EmptyState icon={<History size={30} />} title="Nothing new since the last shift">
          No checklist changes, notes or patterns for {name}.
        </EmptyState>
      ) : (
        <>
          <div className="summary-strip">
            <div className="summary-tile">
              <span className="feed-icon" data-tone="done" aria-hidden="true">
                <CircleCheck size={18} />
              </span>
              <div>
                <strong>{count(["done"])}</strong>
                <span>Routines completed</span>
              </div>
            </div>
            <div className="summary-tile">
              <span className="feed-icon" data-tone="missed" aria-hidden="true">
                <CircleX size={18} />
              </span>
              <div>
                <strong>{count(["missed", "significant"])}</strong>
                <span>Didn&apos;t happen</span>
              </div>
            </div>
            <div className="summary-tile">
              <span className="feed-icon" data-tone="staff" aria-hidden="true">
                <UserRound size={18} />
              </span>
              <div>
                <strong>{count(["observation", "emh"])}</strong>
                <span>Staff notes</span>
              </div>
            </div>
            <div className="summary-tile">
              <span className="feed-icon" data-tone="pattern" aria-hidden="true">
                <Eye size={18} />
              </span>
              <div>
                <strong>{count(["pattern", "resident"])}</strong>
                <span>Profile changes</span>
              </div>
            </div>
          </div>

          <div className="timeline">
            {byDay(handoff.data).map(([day, items]) => (
              <section key={day} className="timeline-day" aria-label={formatDay(day)}>
                <div className="timeline-date">
                  <strong>{formatDay(day)}</strong>
                  <span>{WEEKDAY.format(new Date(`${day}T12:00:00`))}</span>
                </div>
                <ul className="timeline-items">
                  {items.map((item) => {
                    const kind = handoffKind(item);
                    return (
                      <li key={`${item.type}-${item.date}-${item.text}`} className="t-item" data-kind={kind.key}>
                        <span className="feed-icon" data-tone={kind.tone} aria-hidden="true">
                          <kind.Icon size={18} />
                        </span>
                        <div className="t-item-body">
                          <span className="t-kind">{kind.label}</span>
                          <p>{item.text}</p>
                          <div className="feed-meta">
                            {item.source ? (
                              <SourceBadge source={item.source} name={name} date={item.date} />
                            ) : item.type === "observation" ? (
                              <SourceBadge source="staff" name={name} date={item.date} author={item.author} />
                            ) : (
                              <SourceBadge source="emh" name={name} date={item.date} />
                            )}
                            {item.author && item.type !== "observation" ? <span>by {item.author}</span> : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}

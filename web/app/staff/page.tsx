import Link from "next/link";
import { StaffServiceQueue } from "@/components/StaffServiceQueue";
import { ArrowRight, BookOpen, History, Lightbulb, MessageCircle } from "lucide-react";
import { DataBanner } from "@/components/DataBanner";
import { handoffKind } from "@/components/HandoffBits";
import { OnboardingMini } from "@/components/OnboardingMini";
import { Avatar, SourceBadge, StaffHead } from "@/components/ui";
import { getHandoff, getResident } from "@/lib/api";
import { formatDay, greeting } from "@/lib/format";
import { DEMO_RESIDENT_IDS, DEMO_STAFF, homeFor, openingLine } from "@/lib/mock";

export const metadata = { title: "Today" };

const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  weekday: "long",
  month: "long",
  day: "numeric",
});

export default async function StaffDashboard() {
  const people = (await Promise.all(DEMO_RESIDENT_IDS.map((id) => getResident(id)))).filter(
    (person) => person !== null,
  );
  const handoffs = await Promise.all(people.map((person) => getHandoff(DEMO_STAFF.id, person.data.id)));
  const sample = people.some((person) => person.origin === "sample");

  const updates = handoffs
    .flatMap((handoff, index) => handoff.data.map((item) => ({ item, person: people[index].data })))
    .sort((a, b) => b.item.date.localeCompare(a.item.date));
  const attention = updates.filter(({ item }) => {
    const kind = handoffKind(item).key;
    return kind === "missed" || kind === "significant" || kind === "pattern";
  });

  return (
    <>
      <StaffHead eyebrow={TODAY.format(new Date())} title={`${greeting()}, ${DEMO_STAFF.name}`}>
        Your first shift at {DEMO_STAFF.home}. Here&apos;s who you&apos;re supporting and what you need to know.
      </StaffHead>

      {sample ? (
        <div style={{ marginBottom: "var(--space-5)" }}>
          <DataBanner>Sample data, the API didn&apos;t answer, so these are the demo residents.</DataBanner>
        </div>
      ) : null}

      <div className="dash">
        <div className="dash-col">
          <StaffServiceQueue residents={people.map((person) => ({ id: person.data.id, name: person.data.name }))} />
          <section className="shift-card" aria-labelledby="shift-title">
            <span className="shift-icon" aria-hidden="true">
              <History size={26} />
            </span>
            <div>
              <h2 id="shift-title">Start your shift</h2>
              <p>
                First shift, showing the last two weeks.{" "}
                {attention.length > 0 ? `${attention.length} things to know about.` : "Nothing urgent."}
              </p>
            </div>
            <Link href="/staff/updates" className="btn">
              Since last shift
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </section>

          <section className="stack-sm" aria-labelledby="residents-title">
            <h2 id="residents-title" style={{ fontSize: 21 }}>
              Today&apos;s residents
            </h2>
            {people.map(({ data }, index) => {
              const line = openingLine(data.id);
              return (
                <article key={data.id} className="resident-row">
                  <Avatar name={data.name} size="lg" tone={index === 1 ? "coral" : undefined} />
                  <div className="resident-row-body">
                    <div>
                      <h3>
                        <Link href={`/staff/${data.id}`}>{data.name}</Link>
                      </h3>
                      <p className="meta">
                        {homeFor(data.id)} · {data.communication_style}
                      </p>
                    </div>
                    {line ? (
                      <div className="stack-sm" style={{ gap: 6 }}>
                        <p className="quote">&ldquo;{line.text}&rdquo;</p>
                        <div>
                          <SourceBadge source={line.source} name={data.name} date={line.date} />
                        </div>
                      </div>
                    ) : null}
                    <OnboardingMini residentId={data.id} name={data.name} />
                  </div>
                </article>
              );
            })}
          </section>
        </div>

        <div className="dash-col">
          <section className="panel">
            <div className="panel-head">
              <h2>Recent updates</h2>
              <Link href="/staff/updates" className="text-link" style={{ fontSize: 14 }}>
                See all
              </Link>
            </div>
            <ul className="feed">
              {updates.slice(0, 5).map(({ item, person }) => {
                const kind = handoffKind(item);
                return (
                  <li key={`${person.id}-${item.date}-${item.text}`}>
                    <span className="feed-icon" data-tone={kind.tone} aria-hidden="true">
                      <kind.Icon size={18} />
                    </span>
                    <div className="feed-body">
                      <p>{item.text}</p>
                      <div className="feed-meta">
                        <span>{person.name}</span>·<span>{kind.label}</span>·<span>{formatDay(item.date)}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>
                <Lightbulb size={20} aria-hidden="true" />
                Learn next
              </h2>
            </div>
            <ul className="feed">
              <li>
                <span className="feed-icon" data-tone="resident" aria-hidden="true">
                  <BookOpen size={18} />
                </span>
                <div className="feed-body">
                  <Link href="/staff/marcus/onboarding" style={{ fontWeight: 700 }}>
                    Hear Marcus&apos;s story, in Marcus&apos;s own words
                  </Link>
                  <span className="feed-meta">Onboarding step 4 · about 2 minutes</span>
                </div>
              </li>
              <li>
                <span className="feed-icon" aria-hidden="true">
                  <MessageCircle size={18} />
                </span>
                <div className="feed-body">
                  <Link href="/staff/marcus/coach" style={{ fontWeight: 700 }}>
                    Ask: &ldquo;What upsets Marcus?&rdquo;
                  </Link>
                  <span className="feed-meta">The Coach shows where each answer came from</span>
                </div>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}

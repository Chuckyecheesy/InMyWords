import Link from "next/link";
import { Building2, CircleX, Eye, Flag, Scale, Users } from "lucide-react";
import { DataBanner } from "@/components/DataBanner";
import { handoffKind } from "@/components/HandoffBits";
import { StaffShell } from "@/components/StaffShell";
import { Avatar, StaffHead } from "@/components/ui";
import { getActivity, getHandoff, getPendingMemories, getResident } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { DEMO_RESIDENT_IDS, DEMO_STAFF, homeFor } from "@/lib/mock";

export const metadata = { title: "Manager" };

// From db/seed/core.json. Onboarding progress is tracked per device in this demo.
const TEAM = [
  { name: "Priya", role: "Manager", note: "Both homes" },
  { name: "Sam", role: "Staff", note: "Maple House" },
  { name: "Jordan", role: "New staff", note: "First shift, onboarding" },
];

export default async function ManagerPage() {
  const people = (await Promise.all(DEMO_RESIDENT_IDS.map((id) => getResident(id)))).filter(
    (person) => person !== null,
  );
  const rows = await Promise.all(
    people.map(async (person) => {
      const id = person.data.id;
      const [handoff, pending, activity] = await Promise.all([
        getHandoff(DEMO_STAFF.id, id),
        getPendingMemories(id),
        getActivity(id),
      ]);
      const kinds = handoff.data.map((item) => ({ item, kind: handoffKind(item) }));
      return {
        person: person.data,
        home: homeFor(id),
        missed: kinds.filter(({ kind }) => kind.key === "missed" || kind.key === "significant"),
        pending: pending.data.length,
        open: activity.data.filter((item) => item.status === "not_yet_decided").length,
        sample: person.origin === "sample" || handoff.origin === "sample",
      };
    }),
  );
  const shell = people.map(({ data }) => ({ id: data.id, name: data.name }));

  return (
    <StaffShell people={shell}>
      <StaffHead eyebrow="Manager" title="Across homes">
        Open items that need a person, not a score. Every count links to the record behind it.
      </StaffHead>
      {rows.some((row) => row.sample) ? (
        <div style={{ marginBottom: "var(--space-5)" }}>
          <DataBanner>Sample data, the API didn&apos;t answer, so these are the demo homes.</DataBanner>
        </div>
      ) : null}

      <div className="grid-2">
        {rows.map((row) => (
          <section key={row.person.id} className="panel home-card" aria-labelledby={`home-${row.person.id}`}>
            <div className="panel-head">
              <h2 id={`home-${row.person.id}`}>
                <Building2 size={20} aria-hidden="true" />
                {row.home}
              </h2>
              <Link href={`/staff/${row.person.id}`} className="row" style={{ gap: 8, textDecoration: "none", fontWeight: 700, fontSize: 15 }}>
                <Avatar name={row.person.name} size="sm" />
                {row.person.name}
              </Link>
            </div>
            <dl className="kv">
              <dt>
                <CircleX size={16} aria-hidden="true" style={{ display: "inline", verticalAlign: "-3px", marginRight: 6 }} />
                Routines that didn&apos;t happen
              </dt>
              <dd>{row.missed.length}</dd>
              <dt>
                <Eye size={16} aria-hidden="true" style={{ display: "inline", verticalAlign: "-3px", marginRight: 6 }} />
                Waiting for {row.person.name} to confirm
              </dt>
              <dd>{row.pending}</dd>
              <dt>
                <Scale size={16} aria-hidden="true" style={{ display: "inline", verticalAlign: "-3px", marginRight: 6 }} />
                Choices not decided yet
              </dt>
              <dd>{row.open}</dd>
            </dl>
            {row.missed.length > 0 ? (
              <ul className="feed">
                {row.missed.map(({ item, kind }) => (
                  <li key={item.text}>
                    <span className="feed-icon" data-tone={kind.tone} aria-hidden="true">
                      {kind.key === "significant" ? <Flag size={18} /> : <CircleX size={18} />}
                    </span>
                    <div className="feed-body">
                      <p>{item.text}</p>
                      <span className="feed-meta">{formatDay(item.date)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            <Link href={`/staff/handoff?resident=${row.person.id}`} className="text-link" style={{ fontSize: 15 }}>
              Open handoff
            </Link>
          </section>
        ))}
      </div>

      <section className="panel" style={{ marginTop: "var(--space-5)" }}>
        <div className="panel-head">
          <h2>
            <Users size={20} aria-hidden="true" />
            Team
          </h2>
        </div>
        <ul className="feed">
          {TEAM.map((member) => (
            <li key={member.name}>
              <Avatar name={member.name} size="sm" tone="blue" />
              <div className="feed-body">
                <p style={{ fontWeight: 700 }}>
                  {member.name} <span className="muted" style={{ fontWeight: 400 }}>· {member.role}</span>
                </p>
                <span className="feed-meta">{member.note}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </StaffShell>
  );
}

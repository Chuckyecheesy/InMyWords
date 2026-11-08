import Link from "next/link";
import { ArrowRight, Building2, ClipboardList } from "lucide-react";
import { DataBanner } from "@/components/DataBanner";
import { DisplayMenu } from "@/components/DisplayMenu";
import { EntryPreview } from "@/components/EntryPreview";
import { Avatar, WordmarkMark } from "@/components/ui";
import { getResident } from "@/lib/api";
import { DEMO_RESIDENT_IDS, homeFor } from "@/lib/mock";

export default async function EntryPage() {
  const people = (await Promise.all(DEMO_RESIDENT_IDS.map((id) => getResident(id)))).filter(
    (person) => person !== null,
  );
  const sample = people.some((person) => person.origin === "sample");

  return (
    <div className="entry">
      <header className="entry-top">
        <span className="wordmark">
          <WordmarkMark />
          In My Words
        </span>
        <DisplayMenu />
      </header>

      <main id="main" className="entry-hero">
        <div className="entry-intro">
          <div className="entry-title">
            <h1>
              Your story, told once, in <em>your own voice.</em>
            </h1>
            <p>Your choices, made by you. Communication, life story and staff onboarding for supported living.</p>
          </div>
          <EntryPreview />
        </div>

        {sample ? <DataBanner>Sample data — the API didn&apos;t answer, so these are the demo residents.</DataBanner> : null}

        <section aria-labelledby="residents-label">
          <p id="residents-label" className="eyebrow entry-section-label">
            Residents
          </p>
          <div className="entry-grid">
            {people.map(({ data }, index) => (
              <Link prefetch={false} key={data.id} href={`/resident/${data.id}`} className="card card-link entry-card">
                <Avatar name={data.name} size="lg" tone={index === 1 ? "coral" : undefined} />
                <div>
                  <h2>I&apos;m {data.name}</h2>
                  <p>{homeFor(data.id)} · Open my home screen</p>
                </div>
                <ArrowRight className="go" size={24} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="team-label">
          <p id="team-label" className="eyebrow entry-section-label">
            Support team
          </p>
          <div className="entry-grid">
            <Link href="/staff" className="card card-link entry-card">
              <span className="avatar" data-size="lg" data-tone="blue" aria-hidden="true">
                <ClipboardList size={30} />
              </span>
              <div>
                <h2>I&apos;m staff</h2>
                <p>Onboarding, the Coach and shift handoff</p>
              </div>
              <ArrowRight className="go" size={24} aria-hidden="true" />
            </Link>
            <Link href="/manager" className="card card-link entry-card">
              <span className="avatar" data-size="lg" aria-hidden="true" style={{ ["--avatar-bg" as string]: "var(--surface-2)", ["--avatar-ink" as string]: "var(--ink-2)" }}>
                <Building2 size={30} />
              </span>
              <div>
                <h2>Manager</h2>
                <p>Homes, onboarding and open items</p>
              </div>
              <ArrowRight className="go" size={24} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="entry-foot">
        <span>Built for CommuniHacks 2026 · KW Habilitation, Problem 11. All people are fictional.</span>
        <Link href="/pitch" className="text-link">
          Pitch deck
        </Link>
      </footer>
    </div>
  );
}

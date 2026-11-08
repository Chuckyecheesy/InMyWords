import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, AudioLines, Eye } from "lucide-react";
import { FeatureArt } from "@/components/FeatureArt";
import { getPendingMemories, getResident } from "@/lib/api";
import { greeting } from "@/lib/format";

const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  weekday: "long",
  month: "long",
  day: "numeric",
});

export default async function ResidentHomePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();
  const pending = await getPendingMemories(id);
  const name = resident.data.name;
  const base = `/resident/${id}`;

  const features = [
    { href: `${base}/speak`, kind: "speak", title: "Speak For Me", text: "Talk using pictures." },
    { href: `${base}/planner`, kind: "planner", title: "My Planner", text: "Choose when staff visit me." },
    { href: `${base}/choice`, kind: "choice", title: "My Choices", text: "Look at options and decide." },
  ] as const;

  return (
    <div className="home">
      <header className="home-hero">
        <div className="home-heading">
          <h1>{greeting()}, {name}</h1>
          <p className="lead">What would you like to do today?</p>
        </div>
        <time className="home-date" dateTime={new Date().toISOString()}>
          {TODAY.format(new Date())}
        </time>
      </header>

      <nav className="feature-grid" aria-label="What would you like to do?">
        {features.map((feature) => (
          <Link prefetch={false} key={feature.kind} href={feature.href} className="feature-card" data-tone={feature.kind}>
            <FeatureArt kind={feature.kind} />
            <div className="feature-body">
              <h2>{feature.title}</h2>
              <p>{feature.text}</p>
              <span className="feature-go" aria-hidden="true">
                <ArrowRight size={26} />
              </span>
            </div>
          </Link>
        ))}
      </nav>

      <div className="home-more">
        {pending.data.length > 0 ? (
          <Link href={`${base}/confirm`} className="card card-link mini-card" data-tone="pattern">
            <span className="mini-icon" aria-hidden="true">
              <Eye size={30} />
            </span>
            <div>
              <h2>Is this still true?</h2>
              <p>Check something people noticed.</p>
            </div>
            <span className="count-pill" aria-label={`${pending.data.length} to check`}>
              {pending.data.length}
            </span>
          </Link>
        ) : null}
        <Link href={`${base}/voice`} className="card card-link mini-card" data-tone="voice">
          <span className="mini-icon" aria-hidden="true">
            <AudioLines size={30} />
          </span>
          <div>
            <h2>My voice</h2>
            <p>Choose how I sound.</p>
          </div>
        </Link>
      </div>
    </div>
  );
}

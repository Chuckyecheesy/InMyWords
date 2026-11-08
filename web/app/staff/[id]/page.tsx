import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BookOpen,
  Clock,
  Eye,
  HeartHandshake,
  Info,
  MessageCircle,
  MessageSquareQuote,
  ThumbsDown,
  UserRound,
} from "lucide-react";
import { ObservationForm } from "@/components/ObservationForm";
import { Badge, FactList, SourceBadge, SourceLegend } from "@/components/ui";
import { getProfile, getResident, getStory } from "@/lib/api";
import { forSpeech } from "@/lib/format";

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  const profile = await getProfile(id);
  if (!resident || !profile) notFound();
  const story = await getStory(id);
  const name = resident.data.name;
  const p = profile.data;
  const own = [...p.likes, ...p.dislikes, ...p.routines].filter((item) => item.source === "resident");

  return (
    <div className="stack">
      {p.summary ? (
        <section className="profile-hero" aria-label={`In ${name}'s words`}>
          <div className="stack-sm">
            <p className="eyebrow">In {name}&apos;s words</p>
            <p className="profile-quote">&ldquo;{forSpeech(p.summary.text)}&rdquo;</p>
            <div>
              <SourceBadge source={p.summary.source} name={name} date={p.summary.date} />
            </div>
          </div>
          <div className="stack-sm" style={{ alignContent: "end" }}>
            <Link href={`/staff/${id}/onboarding`} className="btn" data-variant="primary">
              Start onboarding
            </Link>
            <Link href={`/staff/${id}/coach`} className="btn" data-variant="secondary">
              <MessageCircle size={18} aria-hidden="true" />
              Ask the Coach
            </Link>
          </div>
        </section>
      ) : null}

      <SourceLegend name={name} />

      <div className="grid-2">
        <div className="stack">
          <section className="panel" data-tone="resident">
            <div className="panel-head">
              <h2>
                <MessageSquareQuote size={20} aria-hidden="true" />
                In {name}&apos;s words
              </h2>
              <Badge tone="resident" label={`${own.length} facts`} />
            </div>
            <p className="panel-sub">Told or confirmed by {name}. Staff notes never overwrite these.</p>
            <FactList items={own} name={name} empty={`Nothing confirmed by ${name} yet.`} />
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>
                <MessageCircle size={20} aria-hidden="true" />
                How {name} communicates
              </h2>
            </div>
            <FactList items={p.communication} name={name} />
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>
                <Clock size={20} aria-hidden="true" />
                Helpful routines
              </h2>
            </div>
            <FactList items={p.routines} name={name} />
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>
                <HeartHandshake size={20} aria-hidden="true" />
                What matters to {name}
              </h2>
            </div>
            <FactList items={p.likes} name={name} />
          </section>

          {p.dislikes.length > 0 ? (
            <section className="panel">
              <div className="panel-head">
                <h2>
                  <ThumbsDown size={20} aria-hidden="true" />
                  What&apos;s hard, and what helps
                </h2>
              </div>
              <FactList items={p.dislikes} name={name} />
            </section>
          ) : null}
        </div>

        <div className="stack">
          {p.pending.length > 0 ? (
            <section className="panel" data-tone="pattern">
              <div className="panel-head">
                <h2>
                  <Eye size={20} aria-hidden="true" />
                  Waiting for {name}&apos;s OK
                </h2>
              </div>
              <p className="panel-sub">Patterns staff or the app noticed. Not {name}&apos;s words until {name} confirms.</p>
              <FactList items={p.pending} name={name} />
            </section>
          ) : null}

          {p.context.length > 0 ? (
            <section className="panel">
              <div className="panel-head">
                <h2>
                  <Info size={20} aria-hidden="true" />
                  Important context
                </h2>
              </div>
              <FactList items={p.context} name={name} />
            </section>
          ) : null}

          <section className="panel" data-tone="staff">
            <div className="panel-head">
              <h2>
                <UserRound size={20} aria-hidden="true" />
                Staff observations
              </h2>
            </div>
            <p className="panel-sub">What the team has seen. Shown separately from {name}&apos;s own words.</p>
            <FactList items={p.observations} name={name} empty="No observations recorded yet." />
            <hr className="divider" />
            <ObservationForm residentId={id} name={name} />
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>
                <BookOpen size={20} aria-hidden="true" />
                {name}&apos;s story
              </h2>
              <Link prefetch={false} href={`/resident/${id}/story`} className="text-link" style={{ fontSize: 15 }}>
                Open
              </Link>
            </div>
            <ul className="feed">
              {story.data.map((chapter) => (
                <li key={chapter.id}>
                  <span className="feed-icon" data-tone={chapter.status === "approved" ? "resident" : undefined} aria-hidden="true">
                    <BookOpen size={18} />
                  </span>
                  <div className="feed-body">
                    <p style={{ fontWeight: 700 }}>{chapter.title}</p>
                    <div className="feed-meta">
                      {chapter.status === "approved" ? (
                        <Badge tone="resident" label={`Approved by ${name}`} />
                      ) : (
                        <Badge tone="warning" label="Draft — not shared" />
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

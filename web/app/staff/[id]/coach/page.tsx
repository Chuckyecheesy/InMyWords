import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { CoachChat } from "@/components/CoachChat";
import { CoachVoice } from "@/components/CoachVoice";
import { getResident } from "@/lib/api";

export const metadata = { title: "Coach" };

export default async function CoachPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();
  const name = resident.data.name;

  return (
    <div className="dash">
      <div className="dash-col">
        <h2 className="sr-only">Ask the Coach about {name}</h2>
        <CoachChat residentId={id} residentName={name} />
      </div>
      <aside className="dash-col">
        <CoachVoice residentId={id} residentName={name} />
        <section className="panel">
          <div className="panel-head">
            <h2>
              <ShieldCheck size={20} aria-hidden="true" />
              How the Coach answers
            </h2>
          </div>
          <ul className="tips" style={{ fontSize: 15 }}>
            <li>
              <span aria-hidden="true">1</span>
              It only uses {name}&apos;s profile, records, EMH notes and staff observations, through the profile and memory services.
            </li>
            <li>
              <span aria-hidden="true">2</span>
              Every answer lists its sources, so you can tell {name}&apos;s own words from staff notes.
            </li>
            <li>
              <span aria-hidden="true">3</span>
              If nothing is on file, it says &ldquo;I don&apos;t know&rdquo; instead of guessing.
            </li>
          </ul>
        </section>
      </aside>
    </div>
  );
}

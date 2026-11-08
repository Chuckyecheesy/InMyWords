import { getResident } from "@/lib/api";
import { sampleEssentials } from "@/lib/mock";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BigButton } from "@/components/shared";

export const metadata = { title: "Onboarding" };

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();

  const essentials = sampleEssentials(id);

  return (
    <div className="stack">
      <div className="onboarding-header">
        <h1>Onboarding: {resident.data.name}</h1>
        <p className="eyebrow">Quick essentials for your first shift (~2 minutes)</p>
      </div>

      <section className="block onboarding-section">
        <h2>Key Facts</h2>
        <div className="essentials-list">
          {essentials.map((item, idx) => (
            <div key={idx} className="essential-item">
              <p>{item.text}</p>
              <span className="essential-source">
                {item.source === "resident"
                  ? "In their words"
                  : item.source === "document"
                    ? `From records, ${item.date || "2019"}`
                    : `${item.source} note`}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="block onboarding-section">
        <h2>Learn More</h2>
        <div className="onboarding-links">
          <Link href={`/staff/${id}/coach`} className="onboarding-link">
            <BigButton tone="neutral">
              💬 Ask the Coach Questions
            </BigButton>
          </Link>

          <Link href={`/resident/${id}/story`} className="onboarding-link">
            <BigButton tone="neutral">
              📖 Read Their Story
            </BigButton>
          </Link>

          <Link href={`/staff/handoff?resident=${id}`} className="onboarding-link">
            <BigButton tone="neutral">
              🔄 View Handoff Items
            </BigButton>
          </Link>
        </div>
      </section>

      <section className="block onboarding-section">
        <h2>Quick Tips</h2>
        <ul className="tips-list">
          <li>Ask the Coach any questions — it knows this person well</li>
          <li>Every answer shows where the information came from</li>
          <li>Read their story to understand what matters to them</li>
          <li>Check the Handoff for recent events or changes</li>
          <li>When in doubt, ask the person or a senior staff member</li>
        </ul>
      </section>

      <div className="onboarding-footer">
        <p>✓ Essentials complete. You're ready for your first shift!</p>
      </div>
    </div>
  );
}

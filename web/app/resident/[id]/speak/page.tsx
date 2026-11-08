import Link from "next/link";
import { notFound } from "next/navigation";
import { ImagePlus, Keyboard, MessageSquareText, Sparkles } from "lucide-react";
import { CategorySpeaker } from "@/components/CategorySpeaker";
import { getResident } from "@/lib/api";

export const metadata = { title: "Speak For Me" };

export default async function SpeakPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();
  return (
    <>
      <CategorySpeaker key={id} residentId={id} />
      <details className="speak-disclosure">
        <summary>Other ways to communicate</summary>
        <nav className="speak-modes" aria-label="Other ways to say it">
        <Link href={`/resident/${id}/speak/words`} className="btn" aria-label="My own words" data-variant="soft" data-size="lg">
          <MessageSquareText size={20} aria-hidden="true" />
          My own words
        </Link>
        <Link href={`/resident/${id}/type`} className="btn" aria-label="Type instead" data-variant="soft" data-size="lg">
          <Keyboard size={20} aria-hidden="true" />
          Type instead
        </Link>
        <Link href={`/resident/${id}/cards`} className="btn" aria-label="My cards" data-variant="soft" data-size="lg">
          <ImagePlus size={20} aria-hidden="true" />
          My cards
        </Link>
        <Link href={`/resident/${id}/guide`} className="btn" aria-label="Guide me" data-variant="soft" data-size="lg">
          <Sparkles size={20} aria-hidden="true" />
          Guide me
        </Link>
        </nav>
      </details>
    </>
  );
}

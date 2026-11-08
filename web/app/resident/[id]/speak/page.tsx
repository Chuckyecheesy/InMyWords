import Link from "next/link";
import { notFound } from "next/navigation";
import { ImagePlus, Keyboard, Sparkles } from "lucide-react";
import { SpeakForMe } from "@/components/SpeakForMe";
import { getResident } from "@/lib/api";

export const metadata = { title: "Speak For Me" };

export default async function SpeakPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();
  return (
    <>
      <nav className="speak-modes" aria-label="Other ways to say it">
        <Link href={`/resident/${id}/type`} className="btn" data-variant="soft" data-size="lg">
          <Keyboard size={20} aria-hidden="true" />
          Type instead
        </Link>
        <Link href={`/resident/${id}/cards`} className="btn" data-variant="soft" data-size="lg">
          <ImagePlus size={20} aria-hidden="true" />
          My cards
        </Link>
        <Link href={`/resident/${id}/guide`} className="btn" data-variant="soft" data-size="lg">
          <Sparkles size={20} aria-hidden="true" />
          Guide me
        </Link>
      </nav>
      <SpeakForMe resident={resident.data} />
    </>
  );
}

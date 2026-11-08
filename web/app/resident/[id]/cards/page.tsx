import { notFound } from "next/navigation";
import { MyCards } from "@/components/MyCards";
import { getResident } from "@/lib/api";

export const metadata = { title: "My cards" };

/** Roadmap Phase 4: residents create, archive and restore their own
 *  picture cards. Archived cards hide; nothing is ever deleted. */
export default async function CardsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();
  return <MyCards resident={resident.data} />;
}

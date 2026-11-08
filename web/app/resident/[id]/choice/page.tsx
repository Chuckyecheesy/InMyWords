import { notFound } from "next/navigation";
import { ChoiceScreen } from "@/components/ChoiceScreen";
import { getResident } from "@/lib/api";

export const metadata = { title: "Choice" };

export default async function ChoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();

  return <ChoiceScreen residentId={id} residentName={resident.data.name} />;
}

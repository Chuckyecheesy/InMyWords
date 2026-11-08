import { notFound } from "next/navigation";
import { ConfirmScreen } from "@/components/ConfirmScreen";
import { getPendingMemories, getResident } from "@/lib/api";

export const metadata = { title: "Confirm" };

export default async function ConfirmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();
  const pending = await getPendingMemories(id);

  return (
    <ConfirmScreen
      residentId={id}
      residentName={resident.data.name}
      memories={pending.data}
    />
  );
}

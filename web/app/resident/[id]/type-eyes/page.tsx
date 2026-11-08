import { notFound } from "next/navigation";
import { HalvingTyper } from "@/components/HalvingTyper";
import { getResident } from "@/lib/api";

export const metadata = { title: "Eye typing" };

export default async function TypeEyesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();
  return <HalvingTyper resident={resident.data} />;
}

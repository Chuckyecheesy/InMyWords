import { notFound } from "next/navigation";
import { TypeBoard } from "@/components/TypeBoard";
import { getResident } from "@/lib/api";

export const metadata = { title: "Type it out" };

export default async function TypePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();
  return <TypeBoard resident={resident.data} />;
}

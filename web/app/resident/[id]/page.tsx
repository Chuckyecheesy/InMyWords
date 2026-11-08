import { notFound } from "next/navigation";
import { SpeakForMe } from "@/components/SpeakForMe";
import { getResident } from "@/lib/api";

export default async function ResidentHomePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();

  return <SpeakForMe resident={resident.data} />;
}

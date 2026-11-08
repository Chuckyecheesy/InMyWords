import { notFound } from "next/navigation";
import { getResident } from "@/lib/api";
import { TeachGesture } from "@/components/TeachGesture";

/** G8 — teach a personal gesture. Server shell; the camera work is client-side. */
export default async function TeachPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();
  return <TeachGesture resident={resident.data} />;
}

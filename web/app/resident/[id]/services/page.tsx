import { notFound } from "next/navigation";
import { ServiceRequests } from "@/components/ServiceRequests";
import { getResident } from "@/lib/api";

export default async function ServicesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();
  return <ServiceRequests key={id} residentId={id} />;
}

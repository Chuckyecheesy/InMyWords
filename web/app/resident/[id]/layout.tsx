import { notFound } from "next/navigation";
import { DataBanner } from "@/components/DataBanner";
import { ResidentNav } from "@/components/ResidentNav";
import { AppShell } from "@/components/AppShell";
import { getResident } from "@/lib/api";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  return { title: resident?.data.name ?? "Resident" };
}

export default async function ResidentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();

  return (
    <AppShell
      eyebrow="Resident"
      title={resident.data.name}
      lede={resident.data.communication_style}
      backHref="/"
      backLabel="Home"
    >
      {resident.origin === "sample" ? (
        <DataBanner>
          Sample data. The API did not answer, so this is the demo resident.
        </DataBanner>
      ) : null}
      <ResidentNav id={id} />
      {children}
    </AppShell>
  );
}

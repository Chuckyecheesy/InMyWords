import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DataBanner } from "@/components/DataBanner";
import { StaffNav } from "@/components/StaffNav";
import { getResident } from "@/lib/api";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  return { title: resident ? `Staff · ${resident.data.name}` : "Staff" };
}

export default async function StaffResidentLayout({
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
      eyebrow="Staff"
      title={resident.data.name}
      lede={resident.data.communication_style}
      backHref="/staff"
      backLabel="All residents"
    >
      {resident.origin === "sample" ? (
        <DataBanner>
          Sample data. The API did not answer, so this is the demo resident.
        </DataBanner>
      ) : null}
      <StaffNav id={id} />
      {children}
    </AppShell>
  );
}

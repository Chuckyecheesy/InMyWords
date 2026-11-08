import { notFound } from "next/navigation";
import { DataBanner } from "@/components/DataBanner";
import { ResidentChrome } from "@/components/ResidentChrome";
import { SessionGuard } from "@/components/SessionGuard";
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
    <ResidentChrome id={id} name={resident.data.name}>
      <SessionGuard residentId={id} />
      {resident.origin === "sample" ? (
        <div className="r-banner">
          <DataBanner>Sample data, the API didn&apos;t answer, so this is the demo profile.</DataBanner>
        </div>
      ) : null}
      {children}
    </ResidentChrome>
  );
}

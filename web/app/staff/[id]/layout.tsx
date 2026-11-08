import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MonitorSmartphone } from "lucide-react";
import { DataBanner } from "@/components/DataBanner";
import { StaffNav } from "@/components/StaffNav";
import { Avatar } from "@/components/ui";
import { getResident } from "@/lib/api";
import { homeFor } from "@/lib/mock";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  return { title: resident ? `${resident.data.name} · Staff` : "Staff" };
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
  const { name, communication_style } = resident.data;

  return (
    <>
      <Link href="/staff" className="crumb">
        <ChevronLeft size={18} aria-hidden="true" />
        All residents
      </Link>
      <div className="resident-head">
        <Avatar name={name} size="lg" tone={id === "dana" ? "coral" : undefined} />
        <div className="resident-head-text">
          <h1>{name}</h1>
          <p>
            {homeFor(id)} · {communication_style}
          </p>
        </div>
        <Link prefetch={false} href={`/resident/${id}`} className="btn" data-variant="secondary">
          <MonitorSmartphone size={18} aria-hidden="true" />
          {name}&apos;s tablet view
        </Link>
      </div>
      {resident.origin === "sample" ? (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <DataBanner>Sample data, the API didn&apos;t answer, so this is the demo profile.</DataBanner>
        </div>
      ) : null}
      <StaffNav id={id} />
      {children}
    </>
  );
}

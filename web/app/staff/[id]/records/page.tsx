import { notFound } from "next/navigation";
import { RecordsLibrary } from "@/components/RecordsLibrary";
import { getRecords, getResident } from "@/lib/api";
import { StaffHead } from "@/components/ui";

export const metadata = { title: "Records" };

/** Roadmap Phase 3: the resident's records library. Append-only history;
 *  new records reach the Coach with "From records" labels. */
export default async function RecordsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();
  const records = await getRecords(id);

  return (
    <>
      <StaffHead eyebrow="Records" title={`${resident.data.name}'s records`}>
        Documents and dated staff updates. Nothing here is {resident.data.name}&apos;s own words
        until {resident.data.name} confirms it; the Coach cites these as &ldquo;From records&rdquo;.
      </StaffHead>
      <RecordsLibrary residentId={id} residentName={resident.data.name} initial={records} />
    </>
  );
}

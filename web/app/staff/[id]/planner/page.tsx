import { notFound } from "next/navigation";
import { DataBanner } from "@/components/DataBanner";
import { StaffPlanner } from "@/components/StaffPlanner";
import { getPlanner, getResident } from "@/lib/api";
import { todayLocal } from "@/lib/planner";

export default async function StaffPlannerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resident = await getResident(id);
  if (!resident) notFound();
  const planner = await getPlanner(id);

  return (
    <div className="stack">
      {planner.origin === "sample" ? (
        <DataBanner>The planner isn&apos;t answering, so these visits may be out of date.</DataBanner>
      ) : null}
      <StaffPlanner
        residentId={id}
        residentName={resident.data.name}
        visits={planner.data.visits}
        staff={planner.data.staff}
        today={todayLocal()}
      />
    </div>
  );
}

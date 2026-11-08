import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { DataBanner } from "@/components/DataBanner";
import { MyPlanner } from "@/components/MyPlanner";
import { getPlanner, getResident } from "@/lib/api";
import { todayLocal } from "@/lib/planner";

export const metadata = { title: "My Planner" };

export default async function PlannerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionCookie = (await cookies()).get("imw_session")?.value;
  const resident = await getResident(id, sessionCookie);
  if (!resident) notFound();
  const planner = await getPlanner(id, sessionCookie);

  return (
    <>
      {planner.origin === "sample" ? (
        <DataBanner>The planner isn&apos;t answering, so nothing can be booked right now.</DataBanner>
      ) : null}
      <MyPlanner
        residentId={id}
        residentName={resident.data.name}
        initialVisits={planner.data.visits}
        declined={planner.data.declined}
        staff={planner.data.staff}
        today={todayLocal()}
      />
    </>
  );
}

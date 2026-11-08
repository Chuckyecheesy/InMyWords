import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { DataBanner } from "@/components/DataBanner";
import { StaffPlanner } from "@/components/StaffPlanner";
import { getPlanner, getResident, getSession } from "@/lib/api";
import { DEMO_STAFF } from "@/lib/mock";
import { todayLocal } from "@/lib/planner";

export default async function StaffPlannerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionCookie = (await cookies()).get("imw_session")?.value;
  const resident = await getResident(id, sessionCookie);
  if (!resident) notFound();
  const [planner, session] = await Promise.all([getPlanner(id, sessionCookie), getSession(sessionCookie)]);

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
        me={session?.user ? session.user.staff_id ?? "" : DEMO_STAFF.id}
        identityLocked={Boolean(session?.user)}
      />
    </div>
  );
}

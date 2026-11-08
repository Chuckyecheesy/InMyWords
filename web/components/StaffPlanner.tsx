"use client";

import { useState } from "react";
import { useCalendarImport, WeekView } from "./MyPlanner";
import type { PlannerVisit, StaffOption } from "@/lib/planner";

/** Staff see the same week the resident sees, read-only: no adding visits. */
export function StaffPlanner({
  residentId,
  residentName,
  visits,
  staff,
  today,
}: {
  residentId: string;
  residentName: string;
  visits: PlannerVisit[];
  staff: StaffOption[];
  /** Toronto date "YYYY-MM-DD", from the server so both renders agree. */
  today: string;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const { imported, importNote, showCalendarFile } = useCalendarImport(residentId, today);

  return (
    <WeekView
      viewer="staff"
      residentName={residentName}
      today={today}
      weekOffset={weekOffset}
      setWeekOffset={setWeekOffset}
      visits={[...visits.filter((v) => v.approved), ...imported]}
      staff={staff}
      importNote={importNote}
      onCalendarFile={showCalendarFile}
    />
  );
}

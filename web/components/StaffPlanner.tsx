"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { respondToVisits } from "@/lib/api";
import { useCalendarImport, WeekView } from "./MyPlanner";
import { localDate, staffName, timeRange, weekFrom, type PlannerVisit, type StaffOption } from "@/lib/planner";
import { usePlannerUpdates } from "./usePlannerUpdates";

/**
 * Staff see the same week the resident sees. They can't add or change a
 * visit, only answer the ones booked with them: accept (it stays, on both
 * calendars) or reject (it disappears from both). PROJECT_PLAN §2.5.
 */
export function StaffPlanner({
  residentId,
  residentName,
  visits: initialVisits,
  staff,
  today,
  me,
  identityLocked = false,
}: {
  residentId: string;
  residentName: string;
  visits: PlannerVisit[];
  staff: StaffOption[];
  /** Toronto date "YYYY-MM-DD", from the server so both renders agree. */
  today: string;
  /** The staff member answering. Only visits booked with them can be answered. */
  me: string;
  identityLocked?: boolean;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [visits, setVisits] = useState(initialVisits);
  const [answeringAs, setAnsweringAs] = useState(me);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const updatesUnavailable = usePlannerUpdates(residentId, !busy, setVisits);
  const { imported, importNote, showCalendarFile } = useCalendarImport(residentId, today);

  const waiting = visits
    .filter((v) => v.approved && v.status === "pending" && v.staff === answeringAs && v.id !== null)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  async function answer(ids: number[], decision: "accept" | "reject") {
    setBusy(true);
    setNote(null);
    const result = await respondToVisits({ staff_id: answeringAs, visit_ids: ids, decision });
    setBusy(false);
    if (!result.ok) {
      setNote(`Nothing was changed. ${result.error}`);
      return;
    }
    const status = decision === "accept" ? "accepted" : "rejected";
    const byId = new Map(result.data.map((v) => [v.id, v]));
    setVisits((current) =>
      current.map((v) => (v.id !== null && ids.includes(v.id) ? { ...v, ...byId.get(v.id), status } : v)),
    );
    const count = ids.length === 1 ? "1 visit" : `${ids.length} visits`;
    setNote(
      decision === "accept"
        ? `Accepted ${count}. ${residentName} sees ${ids.length === 1 ? "it" : "them"} as booked.`
        : `Said no to ${count}. ${residentName} is told, and can pick another time.`,
    );
  }

  return (
    <div className="stack">
      {updatesUnavailable ? (
        <p className="note" role="status">The planner couldn&apos;t refresh. These visits may be out of date.</p>
      ) : null}
      <section className="panel planner-answer" aria-labelledby="planner-answer-h">
        <div className="panel-head">
          <h2 id="planner-answer-h">Waiting for your answer</h2>
          {identityLocked ? (
            <span className="planner-answer-as">
              {answeringAs ? `Answering as ${staffName(staff, answeringAs)}` : "Sign in as staff to answer visits."}
            </span>
          ) : (
            <label className="planner-answer-as">
              Answering as{" "}
              <select value={answeringAs} onChange={(e) => setAnsweringAs(e.target.value)}>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {waiting.length === 0 ? (
          <p className="panel-sub">No visits are waiting for {staffName(staff, answeringAs)}.</p>
        ) : (
          <>
            <ul className="planner-answer-list">
              {waiting.map((v) => {
                const when = `${weekFrom(localDate(v.starts_at))[0].heading}, ${timeRange(v.starts_at, v.ends_at)}`;
                return (
                  <li key={v.id} className="planner-answer-item">
                    <span>{when}</span>
                    <span className="row">
                      <button type="button" className="btn" data-variant="primary" disabled={busy}
                        aria-label={`Accept ${when}`} onClick={() => answer([v.id!], "accept")}>
                        <Check size={18} aria-hidden="true" />
                        Accept
                      </button>
                      <button type="button" className="btn" data-variant="secondary" disabled={busy}
                        aria-label={`Reject ${when}`} onClick={() => answer([v.id!], "reject")}>
                        <X size={18} aria-hidden="true" />
                        Reject
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
            {waiting.length > 1 ? (
              <button type="button" className="btn" data-variant="primary" disabled={busy}
                onClick={() => answer(waiting.map((v) => v.id!), "accept")}>
                Accept all
              </button>
            ) : null}
          </>
        )}
        {note ? (
          <p className="note" role="status">
            {note}
          </p>
        ) : null}
      </section>

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
    </div>
  );
}

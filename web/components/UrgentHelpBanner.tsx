"use client";

import { useEffect, useState } from "react";
import { Hand } from "lucide-react";
import { acknowledgeHelp, getHelpRequests, getSession, type HelpRequest } from "@/lib/api";

/** Staff side of "Get staff help" (ROADMAP Phase 6): a prominent banner on
 *  every staff screen while an urgent request is open. Acknowledging tells
 *  the resident's screen someone is coming. */

const POLL_MS = 5000;

export function UrgentHelpBanner({ people }: { people: { id: string; name: string }[] }) {
  const [requests, setRequests] = useState<HelpRequest[]>([]);
  const [staffId, setStaffId] = useState("sam");

  useEffect(() => {
    void getSession().then((session) => {
      if (session?.user?.staff_id) setStaffId(session.user.staff_id);
    });
    let active = true;
    async function poll() {
      const rows = await getHelpRequests();
      if (active) setRequests(rows.filter((row) => row.status === "open"));
    }
    void poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (requests.length === 0) return null;

  function nameOf(residentId: string) {
    return people.find((person) => person.id === residentId)?.name ?? residentId;
  }

  return (
    <div className="urgent-banner" role="alert" aria-live="assertive">
      {requests.map((request) => (
        <div key={request.id} className="urgent-row">
          <Hand size={22} aria-hidden="true" />
          <strong>{nameOf(request.resident_id)} asked for help.</strong>
          <button
            type="button"
            className="btn"
            data-variant="primary"
            data-size="lg"
            onClick={() => {
              void acknowledgeHelp(request.id, staffId).then((result) => {
                if (result.ok) {
                  setRequests((current) => current.filter((row) => row.id !== request.id));
                }
              });
            }}
          >
            I&apos;m coming
          </button>
        </div>
      ))}
    </div>
  );
}

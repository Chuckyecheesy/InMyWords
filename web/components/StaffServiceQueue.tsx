"use client";

import { useEffect, useState } from "react";
import { getServiceRequests, updateServiceRequest } from "@/lib/api";
import { SERVICE_STATUS, serviceLabel, type ServiceRequest } from "@/lib/services";

export function StaffServiceQueue({ residents }: { residents: { id: string; name: string }[] }) {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let fetching = false;
    const refresh = async () => {
      if (fetching) return;
      fetching = true;
      const result = await getServiceRequests();
      fetching = false;
      if (cancelled) return;
      setLoaded(true);
      if (result.ok && result.data) { setRequests(result.data.requests); setError(null); }
      else setError("The request queue is unavailable. Retrying shortly.");
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  async function change(request: ServiceRequest) {
    setBusy(request.id);
    const result = await updateServiceRequest(request.id, request.status === "sent" ? "acknowledged" : "completed");
    if (result.ok && result.data) setRequests((old) => old.map((row) => row.id === request.id ? result.data! : row));
    else setError("This request could not be updated. Check its status and try again.");
    setBusy(null);
  }

  return <section className="panel service-staff-queue" aria-labelledby="staff-request-title">
    <h2 id="staff-request-title">Resident requests</h2>
    <p className="panel-sub">Confirmed by residents · updates every 5 seconds</p>
    {error && <p role="alert">{error}</p>}
    {!loaded && <p role="status">Loading requests…</p>}
    {loaded && !error && !requests.length && <p>No requests yet.</p>}
    {requests.map((request) => <article className="service-request-row" key={request.id}>
      <div><h3>{residents.find((person) => person.id === request.resident_id)?.name ?? request.resident_id}</h3>
        <p>{request.categories.map(serviceLabel).join(" · ")}</p>
        <p><strong>{SERVICE_STATUS[request.status]}</strong> · <time dateTime={request.created_at}>{new Date(request.created_at).toLocaleString()}</time></p>
        <span className="note">Resident confirmed</span>
      </div>
      {(request.status === "sent" || request.status === "acknowledged") && <button type="button" className="btn" disabled={busy !== null} onClick={() => void change(request)}>{busy === request.id ? "Saving…" : request.status === "sent" ? "Acknowledge" : "Complete"}</button>}
    </article>)}
  </section>;
}

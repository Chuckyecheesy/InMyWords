"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BellRing, Check, CheckCircle2, Send } from "lucide-react";
import { getServiceRequests, submitServiceRequest, updateServiceRequest, postInputEvents } from "@/lib/api";
import { SERVICE_CATEGORIES, SERVICE_STATUS, serviceLabel, type ServiceCategory, type ServiceRequest } from "@/lib/services";
import { EventQueue } from "@/lib/input/queue";
import { ServiceInput } from "./ServiceInput";

type Draft = { categories: ServiceCategory[]; submissionKey: string };
const draftKey = (id: string) => `imw-service-draft-${id}`;

export function ServiceRequests({ residentId }: { residentId: string }) {
  const region = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [draft, setDraft] = useState<Draft>({ categories: [], submissionKey: "" });
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState<"choose" | "review" | "sent">("choose");
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const events = useRef<EventQueue | null>(null);

  useEffect(() => {
    const queue = new EventQueue(residentId, async (items) => {
      const result = await postInputEvents(items);
      return result.ok && result.data?.saved === items.length;
    });
    queue.start(); events.current = queue;
    return () => { queue.stop(); events.current = null; };
  }, [residentId]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
    if (cancelled) return;
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey(residentId)) ?? "null");
      const valid = saved && typeof saved.submissionKey === "string" && Array.isArray(saved.categories);
      setDraft(valid ? {
        categories: [...new Set<ServiceCategory>(saved.categories.filter((id: string) => SERVICE_CATEGORIES.some((c) => c.id === id)))],
        submissionKey: saved.submissionKey || crypto.randomUUID(),
      } : { categories: [], submissionKey: crypto.randomUUID() });
    } catch { setDraft({ categories: [], submissionKey: crypto.randomUUID() }); }
    setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [residentId]);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(draftKey(residentId), JSON.stringify(draft)); } catch { /* visible state still works */ }
  }, [draft, loaded, residentId]);

  useEffect(() => {
    let cancelled = false;
    let fetching = false;
    const refresh = async () => {
      if (fetching) return;
      fetching = true;
      const result = await getServiceRequests(residentId);
      fetching = false;
      if (cancelled) return;
      if (result.ok && result.data) { setRequests(result.data.requests); setQueueError(null); }
      else setQueueError("Request updates are unavailable. We will try again shortly.");
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [residentId]);

  useEffect(() => { heading.current?.focus(); }, [screen]);

  async function activate(target: string, via: "touch" | "hand" | "gaze" = "touch") {
    if (!loaded || inFlight.current) return;
    const inputType = via === "hand" ? "gesture" : via;
    const log = (action: "select" | "approve" | "cancel", outcome: "confirmed" | "cancelled" = "confirmed") =>
      events.current?.add(inputType, action, target, outcome, {
        holdMs: via === "touch" ? 0 : 1000, gesture: via === "hand" ? "hand_pointer" : null, confidence: 1,
      });
    if (SERVICE_CATEGORIES.some((c) => c.id === target) && screen === "choose") {
      const category = target as ServiceCategory;
      log("select"); setError(null);
      setDraft((old) => ({ submissionKey: crypto.randomUUID(), categories: old.categories.includes(category) ? old.categories.filter((id) => id !== category) : [...old.categories, category] }));
    } else if (target === "review" && draft.categories.length) {
      log("select"); setScreen("review"); setError(null);
    } else if (target === "back") {
      log("cancel", "cancelled"); setScreen("choose"); setError(null);
    } else if (target === "send" && screen === "review" && draft.categories.length) {
      log("approve"); inFlight.current = true; setBusy(true); setError(null);
      const result = await submitServiceRequest(residentId, draft.categories, draft.submissionKey);
      if (result.ok && result.data) {
        setRequests((old) => [result.data!, ...old.filter((r) => r.id !== result.data!.id)]);
        setDraft({ categories: [], submissionKey: crypto.randomUUID() }); setScreen("sent");
      } else setError("We could not confirm your request was saved. Your choices are kept. Use Confirm again to retry safely.");
      setBusy(false); inFlight.current = false;
    } else if (target.startsWith("cancel:")) {
      log("cancel", "cancelled"); inFlight.current = true; setBusy(true); setError(null);
      const result = await updateServiceRequest(target.slice(7), "cancelled");
      if (result.ok && result.data) setRequests((old) => old.map((r) => r.id === result.data!.id ? result.data! : r));
      else setError("The request could not be cancelled. Check its status and try again.");
      setBusy(false); inFlight.current = false;
    }
  }

  const targets = { disabled: busy || !loaded };
  return <div className="stack service-page" ref={region}>
    <Link href={`/resident/${residentId}`} className="crumb"><ArrowLeft size={22} aria-hidden="true" /> My home</Link>
    <header className="page-head">
      <h1 ref={heading} tabIndex={-1}>{screen === "choose" ? "What would you like help with?" : screen === "review" ? "Ready to call staff?" : "Your request is with staff"}</h1>
      <p className="lead">{screen === "choose" ? "Choose one or more pictures, then review your request." : screen === "review" ? "Staff will see these choices when you confirm." : "You can see updates below."}</p>
    </header>
    <ServiceInput residentId={residentId} region={region} screen={screen} disabled={busy} onSelect={(target, mode) => void activate(target, mode)} />
    {error && <p role="alert" className="service-error">{error}</p>}
    {screen === "choose" && <>
      <div className="service-category-grid" aria-label="Services">
        {SERVICE_CATEGORIES.map((category) => <button type="button" key={category.id} className="service-category" data-service-target={category.id} aria-pressed={draft.categories.includes(category.id)} {...targets} onClick={() => void activate(category.id)}>
          {/* Local project imagery also works without a Cloudinary connection. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={category.image} alt="" width={480} height={320} />
          <span className="service-category-label">{category.label}<span className="service-check" aria-hidden="true">{draft.categories.includes(category.id) && <Check size={26} />}</span></span>
        </button>)}
      </div>
      <p role="status">{draft.categories.length} {draft.categories.length === 1 ? "category" : "categories"} selected</p>
      <button type="button" className="btn service-bar" data-variant="primary" data-service-target="review" disabled={busy || !loaded || !draft.categories.length} onClick={() => void activate("review")}>Review request <ArrowLeft className="service-forward" size={26} aria-hidden="true" /></button>
    </>}
    {screen === "review" && <>
      <ul className="service-summary" aria-label="Your request">{draft.categories.map((id) => <li key={id}><CheckCircle2 size={28} aria-hidden="true" />{serviceLabel(id)}</li>)}</ul>
      <p className="note">Family asks staff to help you connect with your family.</p>
      <div className="service-bars">
        <button type="button" className="btn service-bar" data-service-target="back" {...targets} onClick={() => void activate("back")}><ArrowLeft size={28} aria-hidden="true" />Back</button>
        <button type="button" className="btn service-bar" data-variant="primary" data-service-target="send" {...targets} onClick={() => void activate("send")}><Send size={28} aria-hidden="true" />{busy ? "Sending…" : "Confirm and call staff"}</button>
      </div>
    </>}
    {screen === "sent" && <>
      <div className="service-success"><BellRing size={42} aria-hidden="true" /><p className="lead">Sent to staff</p></div>
      <button type="button" className="btn service-bar" data-service-target="back" {...targets} onClick={() => void activate("back")}>Make another request</button>
    </>}
    <section className="service-history" aria-labelledby="request-status-title">
      <h2 id="request-status-title">My requests</h2>
      {queueError && <p role="status">{queueError}</p>}
      {!queueError && !requests.length && <p className="note">Your confirmed requests will appear here.</p>}
      {requests.map((request) => <article className="service-request-row" key={request.id}>
        <div><h3>{request.categories.map(serviceLabel).join(" · ")}</h3><p role="status">{SERVICE_STATUS[request.status]}</p><time dateTime={request.created_at}>{new Date(request.created_at).toLocaleString()}</time></div>
        {(request.status === "sent" || request.status === "acknowledged") && <button type="button" className="btn" data-service-target={`cancel:${request.id}`} disabled={busy} onClick={() => void activate(`cancel:${request.id}`)}>Cancel request</button>}
      </article>)}
    </section>
  </div>;
}

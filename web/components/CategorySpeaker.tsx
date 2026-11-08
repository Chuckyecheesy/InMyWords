"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw, Undo2, Volume2 } from "lucide-react";
import { logSentence, postInputEvents, speak } from "@/lib/api";
import { GAZE_DWELL_MS } from "@/lib/input/gaze-zones";
import { EventQueue } from "@/lib/input/queue";
import { SERVICE_CATEGORIES, serviceSentence, type ServiceCategory } from "@/lib/services";
import { ServiceInput } from "./ServiceInput";

export function CategorySpeaker({ residentId }: { residentId: string }) {
  const [selected, setSelected] = useState<ServiceCategory[]>([]);
  const [undone, setUndone] = useState<ServiceCategory[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const region = useRef<HTMLDivElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const events = useRef<EventQueue | null>(null);
  const pendingRef = useRef<string | null>(null);
  const committing = useRef(false);
  const sentence = serviceSentence(selected);

  function setProposal(target: string | null) {
    pendingRef.current = target;
    setPending(target);
  }
  const key = `imw-speaking-categories-${residentId}`;

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const saved = JSON.parse(localStorage.getItem(key) ?? "[]");
        if (Array.isArray(saved)) setSelected(SERVICE_CATEGORIES.filter((c) => saved.includes(c.id)).map((c) => c.id));
      } catch { /* Start with an empty sentence if storage is unavailable. */ }
      setLoaded(true);
    });
    const queue = new EventQueue(residentId, async (items) => {
      const result = await postInputEvents(items);
      return result.ok && result.data?.saved === items.length;
    });
    queue.start(); events.current = queue;
    return () => {
      cancelled = true; mounted.current = false; queue.stop();
      if (audio.current) {
        audio.current.onended = null; audio.current.onerror = null; audio.current.pause();
      }
    };
  }, [residentId, key]);

  useEffect(() => {
    if (loaded) {
      try { localStorage.setItem(key, JSON.stringify(selected)); } catch { /* Current choices still work. */ }
    }
  }, [selected, loaded, key]);

  function proposalTitle(target: string): string {
    const category = SERVICE_CATEGORIES.find((item) => item.id === target);
    if (category) return category.label;
    if (target === "say") return sentence || "Say my words";
    return selected.length ? "Start again" : "Undo";
  }

  function confirmLabel(target: string): string {
    const category = SERVICE_CATEGORIES.find((item) => item.id === target);
    if (category) return `${selected.includes(category.id) ? "Remove" : "Add"} ${category.label}`;
    if (target === "say") return "Say my words";
    if (target === "reset") return selected.length ? "Start again" : "Undo";
    return "Confirm";
  }

  function dismiss(mode: "touch" | "gaze" | "hand") {
    const target = pendingRef.current;
    if (!target) return;
    const input = mode === "hand" ? "gesture" : mode;
    events.current?.add(input, "cancel", target, "cancelled", {
      holdMs: mode === "touch" ? 0 : GAZE_DWELL_MS,
      gesture: mode === "hand" ? "hand_pointer" : null,
    });
    setProposal(null);
  }

  async function activate(target: string, mode: "touch" | "gaze" | "hand" = "touch") {
    if (!loaded || inFlight.current) return;
    if (target === "gaze:cancel") { dismiss(mode); return; }
    if (target === "gaze:confirm") {
      const next = pendingRef.current;
      setProposal(null);
      if (!next) return;
      committing.current = true;
      try { await activate(next, mode); }
      finally { committing.current = false; }
      return;
    }
    const input = mode === "hand" ? "gesture" : mode;
    const category = SERVICE_CATEGORIES.find((c) => c.id === target);
    const canPropose = !!category || target === "reset" || target === "say";
    if (mode === "gaze" && !committing.current && canPropose) {
      if (target === "say" && !sentence) return;
      if (target === "reset" && !selected.length && !undone.length) return;
      setProposal(target);
      return;
    }
    setProposal(null);
    const options = {
      holdMs: mode === "touch" ? 0 : mode === "gaze" ? GAZE_DWELL_MS : 1000,
      gesture: mode === "hand" ? "hand_pointer" : null,
    };
    setError(null); setStatus("");
    if (category) {
      const removing = selected.includes(category.id);
      setSelected((old) => removing ? old.filter((id) => id !== category.id) : [...old, category.id]);
      setUndone([]);
      events.current?.add(input, "select", category.id, removing ? "cancelled" : "confirmed", options);
    } else if (target === "reset") {
      if (selected.length) {
        setUndone(selected); setSelected([]);
        events.current?.add(input, "cancel", "sentence", "cancelled", options);
      } else { setSelected(undone); setUndone([]); }
    } else if (target === "say" && sentence) {
      inFlight.current = true; setBusy(true);
      events.current?.add(input, "approve", "sentence", "confirmed", options);
      const result = await speak({ resident_id: residentId, text: sentence });
      if (!mounted.current) return;
      if (!result.ok) {
        setError("The voice could not load. Your sentence is kept. Choose Say my words to retry.");
        inFlight.current = false; setBusy(false); return;
      }
      const player = new Audio(result.data.audio_url);
      audio.current = player;
      const finish = () => { inFlight.current = false; setBusy(false); };
      player.onended = () => { setStatus("Finished speaking."); finish(); };
      player.onerror = () => { setError("The audio could not play. Your sentence is kept. Try again."); finish(); };
      try {
        await player.play();
        setStatus("Speaking your sentence…");
        const saved = await logSentence({ resident_id: residentId, tiles: selected, chosen_text: sentence, approved: true });
        if (!saved.ok) setError("Your sentence was spoken, but it could not be saved to your history.");
      } catch {
        setError("The audio could not play. Tap Say my words to try again."); finish();
      }
    }
  }

  return <div className="service-page simple-speak" ref={region}>
    <header className="simple-speak-heading"><h1>My Words</h1><p>Choose a picture. Then say your sentence.</p></header>
    <ServiceInput residentId={residentId} region={region} screen="speak" disabled={busy || !loaded} defaultMode="gaze" compact onSelect={(target, mode) => void activate(target, mode)} />
    <div className="service-category-grid" aria-label="Three communication categories">
      {SERVICE_CATEGORIES.map((category) => <button type="button" className="service-category" key={category.id} data-service-target={category.id} aria-pressed={selected.includes(category.id)} disabled={busy || !loaded} onClick={() => void activate(category.id)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={category.image} alt="" width={480} height={320} />
        <span className="service-category-label">{category.label}<span className="service-check" aria-hidden="true">{selected.includes(category.id) && <Check size={28} />}</span></span>
      </button>)}
    </div>
    <section className="simple-speak-sentence" aria-label="Your sentence"><p className="composer-sentence" aria-live="polite">{sentence || "Your sentence will appear here."}</p></section>
    <div className="simple-speak-actions">
      <button type="button" className="btn service-bar" data-service-target="reset" disabled={busy || !loaded || (!selected.length && !undone.length)} onClick={() => void activate("reset")}>
        {selected.length ? <RotateCcw size={26} aria-hidden="true" /> : <Undo2 size={26} aria-hidden="true" />}{selected.length ? "Start again" : "Undo"}
      </button>
      <button type="button" className="btn service-bar" data-variant="primary" data-service-target="say" disabled={busy || !loaded || !sentence} onClick={() => void activate("say")}><Volume2 size={28} aria-hidden="true" />{busy ? "Speaking…" : "Say my words"}</button>
    </div>
    <p className="simple-speak-status" role="status">{status}</p>
    {error && <p className="service-error" role="alert">{error}</p>}
    <Link className="text-link simple-speak-staff" href={`/resident/${residentId}/services`}>Send a request to staff</Link>
    {pending && <div className="gaze-choice" role="dialog" aria-modal="true" aria-label="Confirm or cancel">
      <button type="button" className="gaze-choice-cancel" data-service-target="gaze:cancel" aria-label="Cancel" onClick={() => dismiss("touch")}>Cancel</button>
      <p className="gaze-choice-gap">{proposalTitle(pending)}. Look left to cancel. Look right to confirm.</p>
      <button type="button" className="gaze-choice-confirm" data-variant="primary" data-service-target="gaze:confirm" aria-label="Confirm" onClick={() => void activate("gaze:confirm", "touch")}>
        <span className="gaze-choice-kicker">Confirm</span>{confirmLabel(pending)}
      </button>
    </div>}
  </div>;
}

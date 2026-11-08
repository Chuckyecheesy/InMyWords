"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { CalendarCheck, ChevronLeft, ChevronRight, Upload, Volume2 } from "lucide-react";
import {
  bookVisits,
  getPlanner,
  importCalendarView,
  previewRoutine,
  saveRoutine,
  speak,
} from "@/lib/api";
import {
  DAYS,
  LENGTH_CHOICES,
  TIME_CHOICES,
  clockFromHHMM,
  groupByDay,
  lengthLabel,
  localDate,
  routineSentence,
  staffName,
  timeRange,
  weekFrom,
  type DayCode,
  type PlannerVisit,
  type StaffOption,
} from "@/lib/planner";
import { speakWithDevice } from "@/lib/speech";
import { BigButton } from "./shared";

/** After Approve, the resident can still undo before anything is saved. */
export const PLANNER_CANCEL_WINDOW_MS = 5000;

type Step = "week" | "who" | "time" | "length" | "days" | "review";
type Phase = "proposed" | "window" | "booking" | "done" | "cancelled";

const QUESTIONS: Record<Exclude<Step, "week" | "review">, { n: number; text: string }> = {
  who: { n: 1, text: "Who do you want to see?" },
  time: { n: 2, text: "What time?" },
  length: { n: 3, text: "For how long?" },
  days: { n: 4, text: "Which days?" },
};

export function MyPlanner({
  residentId,
  residentName,
  initialVisits,
  staff,
  today,
  cancelWindowMs = PLANNER_CANCEL_WINDOW_MS,
}: {
  residentId: string;
  residentName: string;
  initialVisits: PlannerVisit[];
  staff: StaffOption[];
  /** Toronto date "YYYY-MM-DD", from the server so both renders agree. */
  today: string;
  cancelWindowMs?: number;
}) {
  const [step, setStep] = useState<Step>("week");
  const [person, setPerson] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [days, setDays] = useState<DayCode[] | null>(null);
  const [choosingDays, setChoosingDays] = useState(false);
  const [picked, setPicked] = useState<DayCode[]>([]);
  const [preview, setPreview] = useState<PlannerVisit[] | null>(null);
  const [phase, setPhase] = useState<Phase>("proposed");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visits, setVisits] = useState<PlannerVisit[]>(initialVisits);
  const [imported, setImported] = useState<PlannerVisit[]>([]);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const who = person ? staffName(staff, person) : "";
  const sentence = person && start && minutes ? routineSentence(who, start, minutes, days) : "";

  async function hear(textToSay: string) {
    if (!textToSay) return;
    const spoken = await speak({ resident_id: residentId, text: textToSay });
    if (spoken.ok) {
      try {
        await new Audio(spoken.data.audio_url).play();
        return;
      } catch {
        // fall through to the device voice
      }
    }
    speakWithDevice(textToSay);
  }

  function begin() {
    setPerson(null);
    setStart(null);
    setMinutes(null);
    setDays(null);
    setChoosingDays(false);
    setPicked([]);
    setPreview(null);
    setNote(null);
    setError(null);
    setPhase("proposed");
    setStep("who");
  }

  function back() {
    setError(null);
    if (step === "who" || step === "week") setStep("week");
    else if (step === "time") setStep("who");
    else if (step === "length") setStep("time");
    else if (step === "days") {
      if (choosingDays) setChoosingDays(false);
      else setStep("length");
    } else if (step === "review" && phase === "proposed") setStep("days");
  }

  async function review(chosenDays: DayCode[] | null) {
    if (!person || !start || !minutes) return;
    setDays(chosenDays);
    setPreview(null);
    setError(null);
    setNote(null);
    setPhase("proposed");
    setStep("review");
    const result = await previewRoutine({
      resident_id: residentId,
      person,
      start,
      length_min: minutes,
      days: chosenDays,
      start_date: today,
    });
    if (result.ok) setPreview(result.data);
    else setError(result.error);
  }

  function clearTimer() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  async function finish() {
    if (!person || !start || !minutes) return;
    setPhase("booking");
    setNote("Booking your visits…");
    // Saved only now: after approval and after the cancel window (rule 1).
    const saved = await saveRoutine({
      resident_id: residentId,
      person,
      start,
      length_min: minutes,
      days,
      start_date: today,
    });
    if (!saved.ok) {
      setPhase("proposed");
      setNote(null);
      setError(`Nothing was booked. ${saved.error}`);
      return;
    }
    const booked = await bookVisits({ resident_id: residentId, routine_id: saved.data.routine_id, approved: true });
    if (!booked.ok) {
      setPhase("proposed");
      setNote(null);
      setError(`Nothing was booked. ${booked.error}`);
      return;
    }
    const fresh = await getPlanner(residentId);
    setVisits(fresh.origin === "api" ? fresh.data.visits : [...visits, ...booked.data.visits]);
    setPhase("done");
    setNote(
      booked.data.google_synced
        ? `Booked. It is on ${who}'s calendar.`
        : `Booked. ${who} can see it here in My Planner.`,
    );
  }

  function approve() {
    setError(null);
    setPhase("window");
    setNote("Approved. You can still cancel.");
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void finish();
    }, cancelWindowMs);
  }

  function cancel() {
    clearTimer();
    setPhase("cancelled");
    setNote("Cancelled. Nothing was booked.");
  }

  async function showCalendarFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportNote("Reading the calendar file…");
    const b64 = await fileToBase64(file);
    const result = await importCalendarView({ resident_id: residentId, calendar_zip_b64: b64 });
    if (!result.ok) {
      setImportNote(result.error);
      return;
    }
    setImported(result.data);
    setImportNote(`${result.data.length} staff visit times shown. Nothing was booked or sent.`);
  }

  if (step === "week") {
    return (
      <WeekView
        residentName={residentName}
        today={today}
        weekOffset={weekOffset}
        setWeekOffset={setWeekOffset}
        visits={[...visits.filter((v) => v.approved), ...imported]}
        staff={staff}
        onAdd={begin}
        importNote={importNote}
        onCalendarFile={showCalendarFile}
      />
    );
  }

  if (step === "review") {
    const busy = phase === "window" || phase === "booking";
    return (
      <section className="approval-card planner-approval" aria-label="Approval card" data-phase={phase}>
        <p className="eyebrow">Check before booking</p>
        <h2>{sentence}</h2>
        {preview ? (
          <ul className="planner-preview" aria-label="Your visits">
            {preview.map((visit) => (
              <li key={visit.starts_at}>
                <span>{dayHeading(visit)}</span>
                <strong>{timeRange(visit.starts_at, visit.ends_at)}</strong>
              </li>
            ))}
          </ul>
        ) : error ? null : (
          <p className="note" role="status">Working out your week…</p>
        )}
        {phase === "proposed" ? <p className="note">Nothing is booked until you approve.</p> : null}
        {note ? (
          <p className="approval-note" role="status">
            {note}
          </p>
        ) : null}
        {phase === "window" ? <span className="cancel-window" aria-hidden="true" /> : null}
        {error ? (
          <p className="note" role="alert">
            {error}
          </p>
        ) : null}
        <div className="row approval-actions">
          {phase === "proposed" ? (
            <>
              <BigButton tone="approve" onClick={approve} disabled={!preview}>
                Approve
              </BigButton>
              <BigButton onClick={() => setStep("who")}>Change</BigButton>
              <button type="button" className="btn" data-variant="secondary" data-size="lg" onClick={() => void hear(sentence)}>
                <Volume2 size={24} aria-hidden="true" />
                <span className="btn-label">Hear it</span>
              </button>
            </>
          ) : null}
          {phase === "window" ? (
            <BigButton tone="reject" onClick={cancel}>
              Cancel
            </BigButton>
          ) : null}
          {(phase === "done" || phase === "cancelled") && !busy ? (
            <BigButton tone="approve" onClick={() => setStep("week")}>
              Back to my week
            </BigButton>
          ) : null}
        </div>
      </section>
    );
  }

  const q = QUESTIONS[step];
  return (
    <section className="planner-question" aria-labelledby="planner-q">
      <p className="eyebrow">Question {q.n} of 4</p>
      <h2 id="planner-q">{q.text}</h2>

      {step === "who" ? (
        <div className="planner-choices" role="group" aria-label="People">
          {staff.map((s) => (
            <button
              key={s.id}
              type="button"
              className="planner-choice"
              aria-pressed={person === s.id}
              onClick={() => {
                setPerson(s.id);
                setStep("time");
              }}
            >
              <span className="planner-monogram" aria-hidden="true">
                {s.name.slice(0, 1)}
              </span>
              {s.name}
            </button>
          ))}
        </div>
      ) : null}

      {step === "time" ? (
        <div className="planner-choices" role="group" aria-label="Start times">
          {TIME_CHOICES.map((t) => (
            <button
              key={t}
              type="button"
              className="planner-choice"
              aria-pressed={start === t}
              onClick={() => {
                setStart(t);
                setStep("length");
              }}
            >
              {clockFromHHMM(t)}
            </button>
          ))}
        </div>
      ) : null}

      {step === "length" ? (
        <div className="planner-choices" role="group" aria-label="How long">
          {LENGTH_CHOICES.map((m) => (
            <button
              key={m}
              type="button"
              className="planner-choice"
              aria-pressed={minutes === m}
              onClick={() => {
                setMinutes(m);
                setStep("days");
              }}
            >
              {lengthLabel(m)}
            </button>
          ))}
        </div>
      ) : null}

      {step === "days" && !choosingDays ? (
        <div className="planner-choices" role="group" aria-label="Days">
          <button type="button" className="planner-choice" data-primary onClick={() => void review(null)}>
            Every day
          </button>
          <button type="button" className="planner-choice" onClick={() => setChoosingDays(true)}>
            Choose days
          </button>
        </div>
      ) : null}

      {step === "days" && choosingDays ? (
        <>
          <div className="planner-choices planner-days-pick" role="group" aria-label="Pick days">
            {DAYS.map((d) => (
              <button
                key={d.code}
                type="button"
                className="planner-choice"
                aria-pressed={picked.includes(d.code)}
                onClick={() =>
                  setPicked((now) => (now.includes(d.code) ? now.filter((c) => c !== d.code) : [...now, d.code]))
                }
              >
                {d.long}
              </button>
            ))}
          </div>
          <div className="row">
            <BigButton tone="approve" disabled={picked.length === 0} onClick={() => void review(picked)}>
              Done
            </BigButton>
          </div>
        </>
      ) : null}

      <div className="row planner-nav">
        <button type="button" className="btn" data-variant="secondary" data-size="lg" onClick={back}>
          <ChevronLeft size={24} aria-hidden="true" />
          <span className="btn-label">Back</span>
        </button>
      </div>
    </section>
  );
}

/** "Sunday, November 8" for a visit, in Toronto. */
function dayHeading(visit: PlannerVisit): string {
  return weekFrom(localDate(visit.starts_at))[0].heading;
}

function WeekView({
  residentName,
  today,
  weekOffset,
  setWeekOffset,
  visits,
  staff,
  onAdd,
  importNote,
  onCalendarFile,
}: {
  residentName: string;
  today: string;
  weekOffset: number;
  setWeekOffset: (n: number) => void;
  visits: PlannerVisit[];
  staff: StaffOption[];
  onAdd: () => void;
  importNote: string | null;
  onCalendarFile: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const week = weekFrom(today, weekOffset);
  const byDay = groupByDay(visits, week);
  return (
    <div className="planner">
      <header className="planner-head">
        <div>
          <p className="eyebrow">{residentName}&apos;s planner</p>
          <h1>My week</h1>
        </div>
        <BigButton tone="approve" onClick={onAdd}>
          Add a visit
        </BigButton>
      </header>

      <div className="row planner-weeknav">
        <button
          type="button"
          className="btn"
          data-variant="secondary"
          data-size="lg"
          disabled={weekOffset === 0}
          onClick={() => setWeekOffset(weekOffset - 1)}
        >
          <ChevronLeft size={24} aria-hidden="true" />
          <span className="btn-label">Earlier week</span>
        </button>
        <button
          type="button"
          className="btn"
          data-variant="secondary"
          data-size="lg"
          onClick={() => setWeekOffset(weekOffset + 1)}
        >
          <span className="btn-label">Next week</span>
          <ChevronRight size={24} aria-hidden="true" />
        </button>
      </div>

      <ol className="planner-week" aria-label="My week">
        {week.map((day) => {
          const items = byDay.get(day.date) ?? [];
          return (
            <li key={day.date} className="planner-day" data-today={day.date === today || undefined}>
              <h2 className="planner-day-name">
                {day.date === today ? "Today" : day.weekday}
                <span className="planner-day-date">{day.heading.split(", ")[1]}</span>
              </h2>
              {items.length === 0 ? <p className="visit-empty">No visits</p> : null}
              {items.map((v) => (
                <article
                  key={`${v.starts_at}-${v.id ?? v.title}`}
                  className="visit-block"
                  data-kind={v.read_only ? "imported" : "booked"}
                >
                  <strong className="visit-time">{timeRange(v.starts_at, v.ends_at)}</strong>
                  <span className="visit-what">
                    {v.read_only ? v.title || "Staff time" : `Meeting with ${staffName(staff, v.staff)}`}
                  </span>
                  <span className="visit-label">{v.label}</span>
                  {v.google_synced ? (
                    <span className="visit-synced">
                      <CalendarCheck size={20} aria-hidden="true" /> On {staffName(staff, v.staff)}&apos;s calendar
                    </span>
                  ) : null}
                </article>
              ))}
            </li>
          );
        })}
      </ol>

      <details className="planner-staff">
        <summary>For staff: show a calendar file</summary>
        <p>
          If the calendar connection is down, choose a Google Calendar export (.zip). Its times are shown on this
          week only. Nothing is booked or sent.
        </p>
        <label className="btn" data-variant="secondary" data-size="lg">
          <Upload size={24} aria-hidden="true" />
          <span className="btn-label">Choose .zip file</span>
          <input type="file" accept=".zip,application/zip" onChange={onCalendarFile} hidden />
        </label>
        {importNote ? (
          <p className="note" role="status">
            {importNote}
          </p>
        ) : null}
      </details>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

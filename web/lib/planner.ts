/**
 * My Planner helpers (PROJECT_PLAN §2.5). Display only: the server expands
 * routines into visit times (rule 6). This file formats what it sends back.
 * Times read as the spec writes them: "1:00p.m.–3:00p.m.", Toronto time.
 */

export const PLANNER_TZ = "America/Toronto";

export type PlannerVisit = {
  id: number | null;
  staff: string;
  starts_at: string;
  ends_at: string;
  source: "resident" | "staff" | "inferred";
  label: string;
  approved: boolean;
  google_synced: boolean;
  /** Imported from a staff calendar export: shown, never booked or written. */
  read_only?: boolean;
  title?: string;
};

export type StaffOption = { id: string; name: string };

export type DayCode = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export const DAYS: { code: DayCode; long: string }[] = [
  { code: "mon", long: "Monday" },
  { code: "tue", long: "Tuesday" },
  { code: "wed", long: "Wednesday" },
  { code: "thu", long: "Thursday" },
  { code: "fri", long: "Friday" },
  { code: "sat", long: "Saturday" },
  { code: "sun", long: "Sunday" },
];

/** Start times offered as big tiles (24h value, as the API takes it). */
export const TIME_CHOICES = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "18:00"];

export const LENGTH_CHOICES = [30, 60, 120, 180];

function clockParts(hour: number, minute: number): string {
  const suffix = hour < 12 ? "a.m." : "p.m.";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${String(minute).padStart(2, "0")}${suffix}`;
}

/** "13:00" -> "1:00p.m." */
export function clockFromHHMM(value: string): string {
  const [h, m] = value.split(":").map(Number);
  return clockParts(h, m);
}

const LOCAL_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: PLANNER_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function local(iso: string) {
  const parts = Object.fromEntries(
    LOCAL_PARTS.formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/** ISO with offset -> "1:00p.m." in Toronto. */
export function clock(iso: string): string {
  const { hour, minute } = local(iso);
  return clockParts(hour, minute);
}

/** "1:00p.m.–3:00p.m." */
export function timeRange(startIso: string, endIso: string): string {
  return `${clock(startIso)}–${clock(endIso)}`;
}

/** The Toronto calendar date of an instant, "YYYY-MM-DD". */
export function localDate(iso: string): string {
  return local(iso).date;
}

export function todayLocal(now: Date = new Date()): string {
  return localDate(now.toISOString());
}

/** Calendar maths on plain dates at UTC noon, so DST never shifts a day. */
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

const DAY_HEADING = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  day: "numeric",
});

export type WeekDay = { date: string; heading: string; weekday: string };

/** Seven days starting at `start` (a plain date), shifted by whole weeks. */
export function weekFrom(start: string, weekOffset = 0): WeekDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, weekOffset * 7 + i);
    const [y, m, d] = date.split("-").map(Number);
    const at = new Date(Date.UTC(y, m - 1, d, 12));
    const heading = DAY_HEADING.format(at);
    return { date, heading, weekday: heading.split(",")[0] };
  });
}

/** Visits grouped under each day of the week, earliest first. */
export function groupByDay(visits: PlannerVisit[], days: WeekDay[]): Map<string, PlannerVisit[]> {
  const byDay = new Map(days.map((day) => [day.date, [] as PlannerVisit[]]));
  for (const visit of visits) {
    byDay.get(localDate(visit.starts_at))?.push(visit);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return byDay;
}

export function lengthLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = hours === 1 ? "1 hour" : hours > 1 ? `${hours} hours` : "";
  const m = rest ? `${rest} minutes` : "";
  return [h, m].filter(Boolean).join(" ") || "0 minutes";
}

export function daysPhrase(days: DayCode[] | null): string {
  if (!days || days.length === 0 || days.length === 7) return "every day";
  const names = DAYS.filter((day) => days.includes(day.code)).map((day) => day.long);
  if (names.length === 1) return `on ${names[0]}`;
  return `on ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The approval card's sentence, read aloud too. */
export function routineSentence(staffName: string, start: string, minutes: number, days: DayCode[] | null): string {
  return `Meet ${staffName} at ${clockFromHHMM(start)} for ${lengthLabel(minutes)}, ${daysPhrase(days)}.`;
}

export function staffName(staff: StaffOption[], id: string): string {
  return staff.find((s) => s.id === id)?.name ?? id.charAt(0).toUpperCase() + id.slice(1);
}

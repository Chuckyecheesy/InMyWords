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
  /** Staff accept or reject a visit the resident booked (PROJECT_PLAN §2.5). */
  status?: VisitStatus;
  /** Imported from a staff calendar export: shown, never booked or written. */
  read_only?: boolean;
  title?: string;
  all_day?: boolean;
};

export type VisitStatus = "pending" | "accepted" | "rejected";

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

/** The Toronto hour (0–23) of an instant. */
export function localHour(iso: string): number {
  return local(iso).hour;
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

// ---------- Calendar layout (week grid) ----------

/** The Sunday on or before a plain date: calendar weeks run Sunday to Saturday. */
export function weekStartOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); // 0 = Sunday
  return addDays(date, -weekday);
}

/** Minutes after local midnight of `day` (may be < 0 or > 1440 for spill-over). */
function minutesInto(iso: string, day: string): number {
  const at = local(iso);
  const dayShift = Math.round(
    (Date.UTC(...(at.date.split("-").map(Number) as [number, number, number])) -
      Date.UTC(...(day.split("-").map(Number) as [number, number, number]))) / 86_400_000,
  );
  return dayShift * 1440 + at.hour * 60 + at.minute;
}

export type HourBounds = { first: number; last: number };

/** Hours the grid shows: 8a.m.–8p.m., widened to fit this week's timed events. */
export function hourBounds(visits: PlannerVisit[], days: WeekDay[], fallback: HourBounds = { first: 8, last: 20 }): HourBounds {
  let { first, last } = fallback;
  for (const v of visits) {
    if (v.all_day) continue;
    const day = localDate(v.starts_at);
    if (!days.some((d) => d.date === day)) continue;
    const start = minutesInto(v.starts_at, day);
    const end = Math.min(minutesInto(v.ends_at, day), 1440);
    first = Math.min(first, Math.floor(start / 60));
    last = Math.max(last, Math.ceil(end / 60));
  }
  return { first: Math.max(0, first), last: Math.min(24, Math.max(last, first + 1)) };
}

export type PlacedVisit = {
  visit: PlannerVisit;
  /** Percent of the day column, from the first hour shown. */
  top: number;
  height: number;
  /** Side-by-side position among overlapping events. */
  lane: number;
  lanes: number;
};

/** Position one day's timed visits on the grid. Overlaps share the width. */
export function layoutDay(visits: PlannerVisit[], day: string, bounds: HourBounds): PlacedVisit[] {
  const span = (bounds.last - bounds.first) * 60;
  const items = visits
    .filter((v) => !v.all_day)
    .map((v) => {
      const start = Math.max(minutesInto(v.starts_at, day), bounds.first * 60);
      const end = Math.min(minutesInto(v.ends_at, day), bounds.last * 60);
      return { visit: v, start, end: Math.max(end, start + 15) };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const placed: PlacedVisit[] = [];
  let cluster: { item: (typeof items)[number]; lane: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
    for (const { item, lane } of cluster) {
      placed.push({
        visit: item.visit,
        top: ((item.start - bounds.first * 60) / span) * 100,
        height: ((item.end - item.start) / span) * 100,
        lane,
        lanes,
      });
    }
    cluster = [];
  };
  for (const item of items) {
    if (cluster.length && item.start >= clusterEnd) flush();
    const laneEnds: number[] = [];
    for (const c of cluster) laneEnds[c.lane] = Math.max(laneEnds[c.lane] ?? -1, c.item.end);
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.length;
    cluster.push({ item, lane });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (cluster.length) flush();
  return placed;
}

/** "9a.m.", "12p.m.", "1p.m." for the hour scale. */
export function hourLabel(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${hour < 12 || hour === 24 ? "a.m." : "p.m."}`;
}

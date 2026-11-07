import type { ChipTone, HandoffItem, SourceType } from "./types";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function zonedParts(iso: string): { month: string; day: string; year: string; time: string | null } | null {
  const date = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: iso.length === 10 ? undefined : "numeric",
    minute: iso.length === 10 ? undefined : "2-digit",
    hourCycle: "h12",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const monthIndex = Number(get("month")) - 1;
  const month = MONTHS[monthIndex] ?? get("month");
  const hour = get("hour");
  const minute = get("minute");
  const dayPeriod = get("dayPeriod").toLowerCase();
  const time = hour ? `${hour}:${minute} ${dayPeriod}` : null;
  return { month, day: get("day"), year: get("year"), time };
}

export function formatDay(iso: string): string {
  const parts = zonedParts(iso);
  if (!parts) return iso;
  return `${parts.month} ${parts.day}`;
}

export function formatYear(iso: string): string {
  return zonedParts(iso)?.year ?? iso.slice(0, 4);
}

export function formatWhen(iso: string): string {
  const parts = zonedParts(iso);
  if (!parts) return iso;
  if (!parts.time) return `${parts.month} ${parts.day}`;
  return `${parts.month} ${parts.day}, ${parts.time}`;
}

export function sourceChip(
  type: SourceType,
  residentName: string,
  date: string | null,
): { tone: ChipTone; label: string } {
  switch (type) {
    case "resident":
      return { tone: "resident", label: `In ${residentName}'s words` };
    case "staff":
      return {
        tone: "staff",
        label: date ? `Staff note, ${formatDay(date)}` : "Staff note",
      };
    case "emh":
      return {
        tone: "emh",
        label: date ? `From EMH, ${formatDay(date)}` : "From EMH",
      };
    case "document":
      return {
        tone: "document",
        label: date ? `From records, ${formatYear(date)}` : "From records",
      };
    case "inferred":
    case "pattern":
      return { tone: "pattern", label: "Pattern noticed" };
  }
}

export function handoffChip(
  item: HandoffItem,
  residentName: string,
): { tone: ChipTone; label: string } {
  if (item.type === "task") {
    return { tone: "task", label: `Staff task, ${formatDay(item.date)}` };
  }
  if (item.type === "observation") {
    return { tone: "staff", label: `Staff note, ${formatDay(item.date)}` };
  }
  if (item.type === "choice") {
    return { tone: "resident", label: `In ${residentName}'s words` };
  }
  if (item.type === "memory" && item.source) {
    return sourceChip(item.source, residentName, item.date);
  }
  return { tone: "emh", label: `From EMH, ${formatDay(item.date)}` };
}

export function money(amount: number): string {
  return `$${amount}`;
}

/** Plain arithmetic. The model never does this math. */
export function consequence(cost: number, weeklyBudget: number | null): string {
  const costLine = `Costs ${money(cost)}.`;
  if (weeklyBudget == null) return costLine;
  const left = weeklyBudget - cost;
  if (left >= 0) return `${costLine} ${money(left)} left this week.`;
  return `${costLine} ${money(Math.abs(left))} over this week.`;
}

export function choiceStanding(
  status: "chosen" | "not_yet_decided",
  residentName: string,
  chosen: string | null,
): string {
  if (status === "chosen" && chosen) return `${residentName} chose ${chosen}.`;
  return "Not decided yet.";
}

const CHAPTER_TITLES: Record<string, string> = {
  about_me: "About me",
  where_im_from: "Where I'm from",
  people: "People who matter",
  things_i_love: "Things I love",
  what_helps: "What upsets me and what helps",
  my_day: "My day",
  what_i_want: "What I want next",
};

export function chapterTitle(key: string): string {
  return CHAPTER_TITLES[key] ?? key.replaceAll("_", " ");
}

const CATEGORY_LABELS: Record<string, string> = {
  drinks: "Drinks",
  activities: "Activities",
  people: "People",
  places: "Places",
  feelings: "Feelings",
  errands: "Errands",
  words: "Words",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.slice(0, 1).toUpperCase() + category.slice(1);
}

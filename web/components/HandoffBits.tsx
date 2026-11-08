import { CircleCheck, CircleX, ClipboardList, Eye, Flag, MessageSquareQuote, Scale, UserRound } from "lucide-react";
import type { HandoffItem } from "@/lib/types";

export type HandoffKind = {
  key: "done" | "missed" | "significant" | "observation" | "emh" | "pattern" | "resident" | "choice";
  label: string;
  tone: string;
  Icon: typeof CircleCheck;
};

/** One place that decides how a handoff row is labelled and coloured. */
export function handoffKind(item: HandoffItem): HandoffKind {
  if (item.significant) return { key: "significant", label: "Significant event", tone: "significant", Icon: Flag };
  if (item.type === "checklist") {
    return item.status === "missed"
      ? { key: "missed", label: "Routine not completed", tone: "missed", Icon: CircleX }
      : { key: "done", label: "Routine completed", tone: "done", Icon: CircleCheck };
  }
  if (item.type === "observation") return { key: "observation", label: "Staff observation", tone: "staff", Icon: UserRound };
  if (item.type === "choice") return { key: "choice", label: "Choice", tone: "resident", Icon: Scale };
  if (item.type === "memory") {
    return item.source === "inferred" || item.source === "pattern"
      ? { key: "pattern", label: "Pattern noticed", tone: "pattern", Icon: Eye }
      : { key: "resident", label: "Confirmed by resident", tone: "resident", Icon: MessageSquareQuote };
  }
  return { key: "emh", label: "Shift note (EMH)", tone: "staff", Icon: ClipboardList };
}

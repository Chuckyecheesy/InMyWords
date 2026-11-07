import type { ChipTone } from "@/lib/types";

export function SourceChip({ tone, label }: { tone: ChipTone; label: string }) {
  return <span className={`chip chip-${tone}`}>{label}</span>;
}

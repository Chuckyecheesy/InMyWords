import type { ChipTone } from "@/lib/types";
import { Badge } from "./ui";

/** Kept for existing imports; renders the shared provenance badge. */
export function SourceChip({ tone, label }: { tone: ChipTone; label: string }) {
  return <Badge tone={tone} label={label} />;
}

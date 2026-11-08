import type { ReactNode } from "react";
import {
  BookOpen,
  ClipboardList,
  Eye,
  FileText,
  Info,
  MessageSquareQuote,
  UserRound,
} from "lucide-react";
import { initials, sourceChip } from "@/lib/format";
import type { ChipTone, Highlight, SourceType } from "@/lib/types";

/* Brand ------------------------------------------------------------------ */

export function WordmarkMark({ size = 34 }: { size?: number }) {
  return (
    <span className="wordmark-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none">
        <path
          d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.2 3.6c-.5.4-1.3 0-1.3-.6V16A2.5 2.5 0 0 1 4 13.5v-7Z"
          fill="currentColor"
        />
        <path d="M8.5 10h7" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/* People ----------------------------------------------------------------- */

export function Avatar({
  name,
  size,
  tone,
}: {
  name: string;
  size?: "sm" | "lg" | "xl";
  tone?: "coral" | "blue";
}) {
  return (
    <span className="avatar" data-size={size} data-tone={tone} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/* Provenance ------------------------------------------------------------- */

const SOURCE_ICON: Record<ChipTone, typeof UserRound> = {
  resident: MessageSquareQuote,
  staff: UserRound,
  emh: ClipboardList,
  document: FileText,
  inferred: Eye,
  pattern: Eye,
  task: BookOpen,
};

export function Badge({
  tone,
  label,
  size,
}: {
  tone: ChipTone | "success" | "warning" | "neutral";
  label: string;
  size?: "lg";
}) {
  const Icon = tone in SOURCE_ICON ? SOURCE_ICON[tone as ChipTone] : null;
  return (
    <span className="badge" data-tone={tone} data-size={size}>
      {Icon ? <Icon size={size === "lg" ? 18 : 14} strokeWidth={2.4} aria-hidden="true" /> : null}
      {label}
    </span>
  );
}

export function SourceBadge({
  source,
  name,
  date,
  author,
  size,
}: {
  source: SourceType;
  name: string;
  date: string | null;
  author?: string;
  size?: "lg";
}) {
  const chip = sourceChip(source, name, date, author);
  return <Badge tone={chip.tone} label={chip.label} size={size} />;
}

/** One sourced statement. Resident words are quoted; patterns are italic. */
export function Fact({ item, name }: { item: Highlight; name: string }) {
  return (
    <li className="fact" data-source={item.source}>
      <p className="fact-text">{item.text}</p>
      <div>
        <SourceBadge source={item.source} name={name} date={item.date} author={item.author} />
      </div>
    </li>
  );
}

export function FactList({
  items,
  name,
  empty,
}: {
  items: Highlight[];
  name: string;
  empty?: string;
}) {
  if (items.length === 0) {
    return <p className="muted">{empty ?? "Nothing on file yet."}</p>;
  }
  return (
    <ul style={{ listStyle: "none" }}>
      {items.map((item) => (
        <Fact key={`${item.source}-${item.text}`} item={item} name={name} />
      ))}
    </ul>
  );
}

export function SourceLegend({ name }: { name: string }) {
  return (
    <div className="legend" aria-label="What the labels mean">
      <span>Labels:</span>
      <Badge tone="resident" label={`In ${name}'s words`} />
      <Badge tone="staff" label="Staff note" />
      <Badge tone="emh" label="From EMH" />
      <Badge tone="document" label="From records" />
      <Badge tone="pattern" label="Pattern noticed" />
    </div>
  );
}

/* Layout ----------------------------------------------------------------- */

export function StaffHead({
  eyebrow,
  title,
  children,
  actions,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="s-head">
      <div className="s-head-text">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {children ? <p>{children}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon" aria-hidden="true">
        {icon}
      </span>
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function Callout({
  tone,
  icon,
  title,
  children,
  role,
}: {
  tone?: "error" | "success" | "info" | "calm";
  icon?: ReactNode;
  title?: string;
  children?: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <div className="callout" data-tone={tone} role={role}>
      {icon ?? <Info size={20} aria-hidden="true" />}
      <div className="callout-body">
        {title ? <strong>{title}</strong> : null}
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}

export function Progress({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ThinkingDots() {
  return (
    <span className="thinking-dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export function SoundBars() {
  return (
    <span className="sound-bars" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

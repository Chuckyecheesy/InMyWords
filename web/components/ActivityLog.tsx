import { MessageSquareQuote, Scale, Zap } from "lucide-react";
import { formatWhen } from "@/lib/format";
import type { ActivityItem } from "@/lib/types";

const KIND_LABEL: Record<ActivityItem["kind"], string> = {
  sentence: "Sentence",
  choice: "Choice",
  action: "Action",
};

const KIND_ICON = { sentence: MessageSquareQuote, choice: Scale, action: Zap } as const;

function standing(item: ActivityItem, name: string): string {
  if (item.status === "not_yet_decided") return "Not decided yet.";
  if (item.kind === "choice" && item.status === "chosen") return `${name} chose this.`;
  if (item.status === "approved") return "Approved.";
  if (!item.status) return "";
  return item.status.replaceAll("_", " ");
}

/** Actions, choices and sentences with times, newest first. */
export function ActivityLog({
  items,
  residentName,
}: {
  items: ActivityItem[];
  residentName: string;
}) {
  if (items.length === 0) {
    return (
      <div className="empty">
        <span className="empty-icon" aria-hidden="true">
          <Zap size={30} />
        </span>
        <p>Nothing has been logged yet. When {residentName} speaks a sentence or makes a choice, it appears here.</p>
      </div>
    );
  }
  const newestFirst = [...items].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <ul className="timeline-items">
      {newestFirst.map((item) => {
        const note = standing(item, residentName);
        const Icon = KIND_ICON[item.kind];
        return (
          <li key={`${item.kind}-${item.created_at}-${item.text}`}>
            <article className="t-item">
              <span className="feed-icon" data-tone={item.kind === "action" ? "staff" : "resident"} aria-hidden="true">
                <Icon size={18} />
              </span>
              <div className="t-item-body">
                <span className="t-kind">{KIND_LABEL[item.kind]}</span>
                <p>{item.text}</p>
                <div className="feed-meta">
                  <time dateTime={item.created_at}>{formatWhen(item.created_at)}</time>
                  {note ? <span className="badge" data-tone={item.status === "not_yet_decided" ? "neutral" : "resident"}>{note}</span> : null}
                </div>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}

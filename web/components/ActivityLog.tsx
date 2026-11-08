import { formatWhen } from "@/lib/format";
import type { ActivityItem } from "@/lib/types";

const KIND_LABEL: Record<ActivityItem["kind"], string> = {
  sentence: "Sentence",
  choice: "Choice",
  action: "Action",
};

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
      <div className="stack">
        <p>Nothing has been logged yet.</p>
      </div>
    );
  }
  const newestFirst = [...items].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <div className="stack">
      {newestFirst.map((item) => {
        const note = standing(item, residentName);
        return (
          <article key={`${item.kind}-${item.created_at}-${item.text}`} className="fact">
            <p className="eyebrow">{KIND_LABEL[item.kind]}</p>
            <p>{item.text}</p>
            <p>
              <time dateTime={item.created_at}>{formatWhen(item.created_at)}</time>
              {note ? ` · ${note}` : ""}
            </p>
          </article>
        );
      })}
    </div>
  );
}

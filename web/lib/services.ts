export const SERVICE_CATEGORIES = [
  { id: "refreshments", label: "Refreshments", image: "/demo/tiles/marcus_coffee.jpg" },
  { id: "entertainment", label: "Entertainment", image: "/demo/tiles/marcus_movie.jpg" },
  { id: "family", label: "Family", image: "/demo/tiles/marcus_lisa.jpg" },
] as const;

export type ServiceCategory = typeof SERVICE_CATEGORIES[number]["id"];
export type ServiceStatus = "sent" | "acknowledged" | "completed" | "cancelled";
export type ServiceRequest = {
  id: string;
  resident_id: string;
  categories: ServiceCategory[];
  status: ServiceStatus;
  created_at: string;
  updated_at: string;
};
export const SERVICE_STATUS: Record<ServiceStatus, string> = {
  sent: "Sent to staff", acknowledged: "Staff acknowledged", completed: "Completed", cancelled: "Cancelled",
};
export function serviceLabel(id: ServiceCategory): string {
  return SERVICE_CATEGORIES.find((item) => item.id === id)?.label ?? id;
}

/** A complete, predictable sentence, shown before it is spoken. */
export function serviceSentence(categories: ServiceCategory[]): string {
  const phrases: Record<ServiceCategory, string> = {
    refreshments: "some refreshments",
    entertainment: "some entertainment",
    family: "help contacting my family",
  };
  const parts = SERVICE_CATEGORIES.filter((item) => categories.includes(item.id)).map((item) => phrases[item.id]);
  if (!parts.length) return "";
  const joined = parts.length === 1 ? parts[0] : parts.length === 2 ? parts.join(" and ") : `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
  return `I would like ${joined}.`;
}

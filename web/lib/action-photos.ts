/** Picture for one approval-card step. Real photos, matched to the resident. */

const MARCUS: Record<string, string> = {
  book_activity: "tiles/marcus_bowling",
  add_to_calendar: "tiles/marcus_park",
  send_message: "tiles/marcus_lisa",
  create_staff_task: "tiles/marcus_bus",
};

const DANA: Record<string, string> = {
  book_activity: "tiles/dana_garden",
  add_to_calendar: "tiles/dana_walk",
  send_message: "tiles/dana_sister",
  create_staff_task: "tiles/dana_bus",
};

export function stepPhoto(residentId: string, step: string): string {
  const table = residentId.toLowerCase() === "dana" ? DANA : MARCUS;
  return table[step] ?? (residentId.toLowerCase() === "dana" ? "tiles/dana_help" : "tiles/marcus_help");
}

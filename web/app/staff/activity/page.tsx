import { redirect } from "next/navigation";

/** Merged into the unified Updates page (Roadmap Phase 3). */
export default async function ActivityRedirect({
  searchParams,
}: {
  searchParams: Promise<{ resident?: string }>;
}) {
  const { resident } = await searchParams;
  redirect(resident ? `/staff/updates?resident=${resident}` : "/staff/updates");
}

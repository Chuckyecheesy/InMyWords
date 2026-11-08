import { AppShell } from "@/components/AppShell";

export const metadata = { title: "Manager" };

export default function ManagerPage() {
  return (
    <AppShell
      eyebrow="Manager"
      title="Across homes"
      lede="Profile freshness, checklist patterns, and choice stats will show up here."
      backHref="/staff"
      backLabel="Staff"
    >
      <p>This screen is held for the later manager view.</p>
    </AppShell>
  );
}

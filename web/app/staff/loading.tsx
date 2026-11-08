import { AppShell } from "@/components/AppShell";
import { LoadingNotice } from "@/components/LoadingNotice";

export default function Loading() {
  return (
    <AppShell eyebrow="Staff" title="Getting things ready…" backHref="/" backLabel="Home">
      <LoadingNotice message="Loading the staff page…" />
    </AppShell>
  );
}

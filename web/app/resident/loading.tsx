import { AppShell } from "@/components/AppShell";
import { LoadingNotice } from "@/components/LoadingNotice";

export default function Loading() {
  return (
    <AppShell title="Getting things ready…" backHref="/" backLabel="Home">
      <LoadingNotice />
    </AppShell>
  );
}

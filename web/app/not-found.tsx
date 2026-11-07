import Link from "next/link";
import { AppShell } from "@/components/AppShell";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <AppShell title="That page is not here" backHref="/" backLabel="Home">
      <p>The link does not match a resident or a staff screen.</p>
      <Link href="/" className="big-link">
        Back to the start
      </Link>
    </AppShell>
  );
}

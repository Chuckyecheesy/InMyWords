import Link from "next/link";
import { AppShell } from "@/components/AppShell";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <AppShell title="That page isn't here">
      <p className="lead" style={{ marginBottom: 24 }}>
        The link doesn&apos;t match a resident or a staff screen.
      </p>
      <Link href="/" className="btn" data-variant="primary" data-size="lg">
        Back to the start
      </Link>
    </AppShell>
  );
}

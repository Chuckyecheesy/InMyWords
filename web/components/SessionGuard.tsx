"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getSession, type SessionInfo } from "@/lib/api";

/** Accounts (ROADMAP Phase 2): the resident-side privacy screen.
 *  The API already 403s cross-resident data; this blocks the page shell
 *  too, so someone else's dashboard never even renders around the errors.
 *  In required mode, no session sends you to sign in. */
export function SessionGuard({ residentId }: { residentId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);

  useEffect(() => {
    void getSession().then(setSession);
  }, [residentId]);

  useEffect(() => {
    if (session && session.mode === "required" && !session.user) {
      router.replace("/login");
    }
  }, [session, router]);

  if (!session?.user) return null;
  const { user, assignments } = session;
  const blocked =
    user.role === "resident"
      ? user.resident_id !== residentId
      : user.role === "staff"
        ? !assignments.includes(residentId)
        : false;
  if (!blocked) return null;

  return (
    <div className="session-guard" role="alertdialog" aria-label="This page belongs to someone else">
      <div className="card card-pad setup-card">
        <ShieldAlert size={48} aria-hidden="true" />
        <h1>This page belongs to someone else.</h1>
        {user.role === "resident" && user.resident_id ? (
          <Link href={`/resident/${user.resident_id}`} className="btn" data-variant="primary" data-size="xl">
            Go to my page
          </Link>
        ) : (
          <Link href="/staff" className="btn" data-variant="primary" data-size="xl">
            Back to my residents
          </Link>
        )}
        <Link href="/login" className="btn" data-variant="soft" data-size="lg">
          Switch person
        </Link>
      </div>
    </div>
  );
}

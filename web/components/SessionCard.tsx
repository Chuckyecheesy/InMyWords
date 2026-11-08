"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, LogOut } from "lucide-react";
import { getSession, logout, type SessionUser } from "@/lib/api";
import { DEMO_STAFF } from "@/lib/mock";
import { Avatar } from "./ui";

/** Staff sidebar identity: who is signed in, with sign out / switch person.
 *  Without a session (open demo mode) it shows the demo staffer and a
 *  sign-in link, so nothing about the demo flow changes. */
export function SessionCard() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void getSession().then((session) => {
      setUser(session?.user ?? null);
      setLoaded(true);
    });
  }, []);

  if (!loaded || !user) {
    return (
      <div className="s-user">
        <Avatar name={DEMO_STAFF.name} tone="blue" />
        <div>
          <strong>{DEMO_STAFF.name}</strong>
          <span>New staff · {DEMO_STAFF.home}</span>
        </div>
        <Link href="/login" className="btn" data-variant="ghost" data-size="sm" aria-label="Sign in">
          <LogIn size={16} aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <div className="s-user">
      <Avatar name={user.display_name} tone="blue" />
      <div>
        <strong>{user.display_name}</strong>
        <span>{user.role === "manager" ? "Manager" : "Staff"} · signed in</span>
      </div>
      <button
        type="button"
        className="btn"
        data-variant="ghost"
        data-size="sm"
        aria-label="Sign out"
        onClick={() => {
          void logout().then(() => {
            setUser(null);
            router.push("/login");
          });
        }}
      >
        <LogOut size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

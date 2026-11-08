"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Building2, History, LayoutDashboard, MonitorSmartphone } from "lucide-react";
import { DEMO_STAFF } from "@/lib/mock";
import { DisplayMenu } from "./DisplayMenu";
import { Avatar, WordmarkMark } from "./ui";

type Person = { id: string; name: string };

function useCurrent() {
  const pathname = usePathname() ?? "";
  return (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** Staff app frame: sidebar on tablet/desktop, scrolling pills on phones. */
export function StaffShell({ people, children }: { people: Person[]; children: ReactNode }) {
  const isCurrent = useCurrent();
  const main = [
    { href: "/staff", label: "Today", icon: LayoutDashboard, exact: true },
    { href: "/staff/updates", label: "Updates", icon: History },
  ];

  return (
    <div className="s-app">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className="s-sidebar">
        <Link href="/staff" className="s-brand wordmark">
          <WordmarkMark />
          In My Words
          <small>Staff</small>
        </Link>
        <nav className="s-nav" aria-label="Staff sections">
          <p className="s-nav-label">Today</p>
          {main.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="s-nav-link"
              aria-current={isCurrent(item.href, item.exact) ? "page" : undefined}
            >
              <item.icon size={20} aria-hidden="true" />
              {item.label}
            </Link>
          ))}
          <p className="s-nav-label">Residents</p>
          {people.map((person, index) => (
            <Link
              key={person.id}
              href={`/staff/${person.id}`}
              className="s-nav-link"
              aria-current={isCurrent(`/staff/${person.id}`) ? "page" : undefined}
            >
              <Avatar name={person.name} size="sm" tone={index === 1 ? "coral" : undefined} />
              {person.name}
            </Link>
          ))}
          <p className="s-nav-label">More</p>
          <Link href="/manager" className="s-nav-link">
            <Building2 size={20} aria-hidden="true" />
            Manager view
          </Link>
          <Link href="/" className="s-nav-link">
            <MonitorSmartphone size={20} aria-hidden="true" />
            Switch to resident tablet
          </Link>
        </nav>
        <div className="s-user">
          <Avatar name={DEMO_STAFF.name} tone="blue" />
          <div>
            <strong>{DEMO_STAFF.name}</strong>
            <span>New staff · {DEMO_STAFF.home}</span>
          </div>
        </div>
      </aside>
      <div className="s-main">
        <header className="s-topbar">
          <Link href="/staff" className="wordmark">
            <WordmarkMark />
            In My Words
          </Link>
          <DisplayMenu />
        </header>
        <nav className="s-mobile-nav" aria-label="Staff sections (compact)">
          {main.map((item) => (
            <Link key={item.href} href={item.href} aria-current={isCurrent(item.href, item.exact) ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
          {people.map((person) => (
            <Link key={person.id} href={`/staff/${person.id}`} aria-current={isCurrent(`/staff/${person.id}`) ? "page" : undefined}>
              {person.name}
            </Link>
          ))}
        </nav>
        <main id="main" className="s-content">
          {children}
        </main>
      </div>
    </div>
  );
}

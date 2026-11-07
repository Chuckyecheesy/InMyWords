"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function StaffNav({ id }: { id: string }) {
  const pathname = usePathname();
  const links = [
    { href: `/staff/${id}/onboarding`, label: "Onboarding" },
    { href: `/staff/${id}/photos`, label: "Photos" },
    { href: `/staff/${id}/coach`, label: "Coach" },
    { href: `/staff/handoff?resident=${id}`, label: "Since last shift" },
    { href: `/staff/activity?resident=${id}`, label: "Activity" },
  ];

  return (
    <nav className="nav" aria-label="Staff">
      {links.map((link) => {
        const current = pathname === link.href.split("?")[0];
        return (
          <Link key={link.href} href={link.href} aria-current={current ? "page" : undefined}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Camera, GraduationCap, History, MessageCircleQuestion, UserRound } from "lucide-react";

/** Per-resident tabs. Handoff and activity live at shared routes. */
export function StaffNav({ id }: { id: string }) {
  const pathname = usePathname();
  const links = [
    { href: `/staff/${id}`, label: "Profile", icon: UserRound },
    { href: `/staff/${id}/onboarding`, label: "Onboarding", icon: GraduationCap },
    { href: `/staff/${id}/coach`, label: "Coach", icon: MessageCircleQuestion },
    { href: `/staff/handoff?resident=${id}`, label: "Since last shift", icon: History },
    { href: `/staff/activity?resident=${id}`, label: "Activity", icon: Activity },
    { href: `/staff/${id}/photos`, label: "Photos", icon: Camera },
  ];

  return (
    <nav className="tabs" aria-label="Staff">
      {links.map((link) => {
        const current = pathname === link.href.split("?")[0];
        return (
          <Link key={link.href} href={link.href} aria-current={current ? "page" : undefined}>
            <link.icon size={18} aria-hidden="true" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

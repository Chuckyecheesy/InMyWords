"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, FolderOpen, GraduationCap, History, MessageCircleQuestion, UserRound } from "lucide-react";

/** Per-resident tabs. Updates lives at a shared route. */
export function StaffNav({ id }: { id: string }) {
  const pathname = usePathname();
  const links = [
    { href: `/staff/${id}`, label: "Profile", icon: UserRound },
    { href: `/staff/${id}/onboarding`, label: "Onboarding", icon: GraduationCap },
    { href: `/staff/${id}/coach`, label: "Coach", icon: MessageCircleQuestion },
    { href: `/staff/updates?resident=${id}`, label: "Updates", icon: History },
    { href: `/staff/${id}/records`, label: "Records", icon: FolderOpen },
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

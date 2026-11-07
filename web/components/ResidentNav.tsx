"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { suffix: "", label: "Tiles" },
  { suffix: "/story", label: "Story" },
  { suffix: "/choice", label: "Choice" },
  { suffix: "/confirm", label: "Confirm" },
  { suffix: "/voice", label: "Voice" },
];

export function ResidentNav({ id }: { id: string }) {
  const pathname = usePathname();

  return (
    <nav className="nav" aria-label="Resident">
      {LINKS.map((link) => {
        const href = `/resident/${id}${link.suffix}`;
        const current = pathname === href;
        return (
          <Link key={href} href={href} aria-current={current ? "page" : undefined}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

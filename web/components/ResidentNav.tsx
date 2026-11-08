"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { speak } from "@/lib/api";
import { useLongPress } from "./shared";

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
        return <NavLink key={href} href={href} label={link.label} current={current} residentId={id} />;
      })}
    </nav>
  );
}

function NavLink({
  href,
  label,
  current,
  residentId,
}: {
  href: string;
  label: string;
  current: boolean;
  residentId: string;
}) {
  const press = useLongPress((text) => {
    void speak({ resident_id: residentId, text });
  }, label);
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={current ? "page" : undefined}
      onPointerDown={press.onPointerDown}
      onPointerUp={press.onPointerUp}
      onPointerLeave={press.onPointerLeave}
      onPointerCancel={press.onPointerCancel}
      onClick={(event) => {
        if (press.consumeClick()) event.preventDefault();
      }}
    >
      {label}
    </Link>
  );
}

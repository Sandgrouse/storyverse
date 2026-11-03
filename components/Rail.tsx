"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Story map" },
  { href: "/characters", label: "Characters" },
  { href: "/package", label: "Agent package" },
  { href: "/new", label: "New world" },
];

export default function Rail({ worldTitle }: { worldTitle: string }) {
  const pathname = usePathname();
  return (
    <aside className="rail">
      <div className="logo">
        Story<span>verse</span>
      </div>
      <div className="world">
        <div className="eyebrow">World</div>
        <b>{worldTitle}</b>
      </div>
      <nav className="nav" aria-label="Sections">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={pathname === link.href ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="foot">Prototype. Sample content, no model calls.</div>
    </aside>
  );
}

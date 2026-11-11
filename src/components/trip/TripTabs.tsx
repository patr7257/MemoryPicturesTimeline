"use client";

// Section links of one vacation. Real links (not client-side tab state) so
// every section has its own URL; the active one follows the pathname.
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function TripTabs({ tripId, canManage }: { tripId: string; canManage: boolean }) {
  const pathname = usePathname();
  const base = `/trips/${tripId}`;
  const tabs = [
    { href: base, label: "Overview", active: pathname === base },
    { href: `${base}/slideshow`, label: "Slideshow", active: pathname.startsWith(`${base}/slideshow`) },
    ...(canManage
      ? [{ href: `${base}/edit`, label: "Edit", active: pathname.startsWith(`${base}/edit`) }]
      : []),
  ];

  return (
    <nav aria-label="Vacation sections" className="-mx-4 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {tabs.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href as Route}
              aria-current={t.active ? "page" : undefined}
              className={cn(
                "font-hand inline-flex min-h-11 items-center border-b-2 px-4 text-2xl transition-colors",
                t.active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

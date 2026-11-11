import Link from "next/link";

import type { PersonRef } from "@/lib/queries";
import { cn } from "@/lib/utils";

// Chip row driven by the ?person= search param; plain links so the filter
// state survives reloads and is shareable. One scrollable line on phones,
// wrapping from sm up.
export function PersonFilter({
  people,
  activeId,
  basePath = "/timeline",
}: {
  people: PersonRef[];
  activeId?: string;
  basePath?: "/timeline" | "/map" | "/vacations";
}) {
  if (people.length === 0) return null;
  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm transition-colors sm:min-h-8 sm:px-3",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card text-muted-foreground hover:text-foreground",
    );

  return (
    <nav
      aria-label="Filter by person"
      className="mx-auto flex max-w-5xl items-center gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] sm:flex-wrap sm:px-6 [&::-webkit-scrollbar]:hidden"
    >
      <Link href={basePath} className={chip(!activeId)} aria-current={!activeId ? "true" : undefined}>
        Everyone
      </Link>
      {people.map((p) => (
        <Link
          key={p.id}
          href={{ pathname: basePath, query: { person: p.id } }}
          className={chip(activeId === p.id)}
          aria-current={activeId === p.id ? "true" : undefined}
        >
          {p.name}
        </Link>
      ))}
    </nav>
  );
}

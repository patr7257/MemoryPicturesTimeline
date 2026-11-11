import Link from "next/link";

import type { PersonRef } from "@/lib/queries";
import { personQuery, togglePerson } from "@/lib/person-filter";
import { cn } from "@/lib/utils";

// Multi-select chip row driven by repeated ?person= search params; plain links
// so the selection survives reloads and is shareable. A chip toggles one
// person on or off, "Everyone" clears. One scrollable line on phones,
// wrapping from sm up.
export function PersonFilter({
  people,
  activeIds,
  basePath = "/timeline",
}: {
  people: PersonRef[];
  activeIds: readonly string[];
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
  const none = activeIds.length === 0;

  return (
    <nav
      aria-label="Filter by person"
      className="mx-auto flex max-w-5xl items-center gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] sm:flex-wrap sm:px-6 [&::-webkit-scrollbar]:hidden"
    >
      <Link href={basePath} className={chip(none)} aria-current={none ? "true" : undefined}>
        Everyone
      </Link>
      {people.map((p) => {
        const active = activeIds.includes(p.id);
        return (
          <Link
            key={p.id}
            href={{ pathname: basePath, query: personQuery(togglePerson(activeIds, p.id)) }}
            className={chip(active)}
            aria-current={active ? "true" : undefined}
          >
            {p.name}
          </Link>
        );
      })}
    </nav>
  );
}

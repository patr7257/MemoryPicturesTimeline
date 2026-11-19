import Link from "next/link";

import type { PersonRef } from "@/lib/queries";
import { personQuery, togglePerson } from "@/lib/person-filter";
import { cn } from "@/lib/utils";

// Whose countries are shown, as plain links so the choice survives reloads
// and is shareable. Chip styles follow PersonFilter. One person is their map,
// two compare, three or more (or Family) are the union.
export function CountriesPicker({
  people,
  picked,
  showMe,
  meActive,
  familyActive,
}: {
  people: PersonRef[];
  picked: readonly string[];
  showMe: boolean;
  meActive: boolean;
  familyActive: boolean;
}) {
  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm transition-colors sm:min-h-8 sm:px-3",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="mt-4 mb-6">
      <nav
        aria-label="Whose countries"
        className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {showMe && (
          <Link href="/countries" className={chip(meActive)} aria-current={meActive ? "true" : undefined}>
            Me
          </Link>
        )}
        <Link
          href={{ pathname: "/countries", query: { view: "family" } }}
          className={chip(familyActive)}
          aria-current={familyActive ? "true" : undefined}
        >
          Family
        </Link>
        {people.map((p) => {
          const active = picked.includes(p.id);
          return (
            <Link
              key={p.id}
              href={{ pathname: "/countries", query: personQuery(togglePerson(picked, p.id)) }}
              className={chip(active)}
              aria-current={active ? "true" : undefined}
            >
              {p.name}
            </Link>
          );
        })}
      </nav>
      {picked.length === 1 && (
        <p className="mt-2 text-sm text-muted-foreground">Pick two people to compare</p>
      )}
    </div>
  );
}

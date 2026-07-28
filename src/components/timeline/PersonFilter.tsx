import Link from "next/link";

import type { PersonRef } from "@/lib/queries";
import { cn } from "@/lib/utils";

// Chip row driven by the ?person= search param; plain links so the filter
// state survives reloads and is shareable.
export function PersonFilter({
  people,
  activeId,
  basePath = "/",
}: {
  people: PersonRef[];
  activeId?: string;
  basePath?: "/" | "/map";
}) {
  if (people.length === 0) return null;
  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm transition-colors",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card text-muted-foreground hover:text-foreground",
    );

  return (
    <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-6 py-4">
      <Link href={basePath} className={chip(!activeId)}>
        Everyone
      </Link>
      {people.map((p) => (
        <Link
          key={p.id}
          href={{ pathname: basePath, query: { person: p.id } }}
          className={chip(activeId === p.id)}
        >
          {p.name}
        </Link>
      ))}
    </nav>
  );
}

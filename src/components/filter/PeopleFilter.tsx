import Link from "next/link";

import {
  type FilterFamily,
  filterQuery,
  type ResolvedFilter,
  toggleFamily,
  togglePersonIn,
} from "@/lib/person-filter";
import { cn } from "@/lib/utils";

export type FilterPath = "/timeline" | "/map" | "/vacations" | "/slideshow" | "/countries";

// Family row above a name row; every chip is a plain link, so the selection
// lives in the URL. No "use client", no hooks and no server-only imports, so
// server pages and client components can both render it. There is no
// "Everyone" chip: turning every chip off is the empty selection, and
// `emptyAs` says what the page does with it ("bare" = no filter, "none" =
// `pick=none`, show nothing).
export function PeopleFilter({
  pathname,
  resolved,
  families,
  keep,
  emptyAs,
}: {
  pathname: FilterPath;
  resolved: ResolvedFilter;
  families: readonly FilterFamily[];
  keep?: Record<string, string | string[]>;
  emptyAs?: "bare" | "none";
}) {
  const { familyChips, nameChips, selection } = resolved;
  if (nameChips.length === 0) return null;

  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm transition-colors sm:min-h-8 sm:px-3",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card text-muted-foreground hover:text-foreground",
    );
  const row =
    "flex items-center gap-2 overflow-x-auto [scrollbar-width:none] sm:flex-wrap [&::-webkit-scrollbar]:hidden";
  const hrefFor = (next: typeof selection) => ({
    pathname,
    query: { ...keep, ...filterQuery(next, { emptyAs }) },
  });

  return (
    <nav
      aria-label="Filter by family and person"
      className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:px-6"
    >
      {familyChips.length > 0 && (
        <ul aria-label="Families" className={row}>
          {familyChips.map((f) => {
            const active = selection.familyIds.includes(f.id);
            return (
              <li key={f.id} className="shrink-0">
                <Link
                  href={hrefFor(toggleFamily(selection, f.id, families))}
                  prefetch={false}
                  className={chip(active)}
                  aria-current={active ? "true" : undefined}
                >
                  {f.name}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <ul aria-label="People" className={row}>
        {nameChips.map((p) => {
          const active = selection.personIds.includes(p.id);
          return (
            <li key={p.id} className="shrink-0">
              <Link
                href={hrefFor(togglePersonIn(selection, p.id))}
                prefetch={false}
                className={chip(active)}
                aria-current={active ? "true" : undefined}
              >
                {p.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

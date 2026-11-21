"use client";

// Everything on /timeline below the top bar once there are vacations: the
// header with the search, the people filter, the globe and the timeline. The
// search hides vacations (and years left empty) on the client; the server
// already rendered them, and it renders the same result for a `q` in the URL.
// The text lives in the URL as `q`, written with the History API so typing
// never navigates. The people filter is resolved on the server, so its chips
// are links that carry `q` along.
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Play, Plane, Search, SearchX, X } from "lucide-react";

import type { TimelineYear } from "@/lib/queries";
import type { FilterFamily, ResolvedFilter, filterQuery } from "@/lib/person-filter";
import { searchYears } from "@/lib/trip-search";
import { GlobeOfMemories } from "@/components/globe/GlobeOfMemories";
import { PeopleFilter } from "@/components/filter/PeopleFilter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Timeline } from "./Timeline";
import { TimelineHeader } from "./TimelineHeader";

const plural = (n: number) => (n === 1 ? "vacation" : "vacations");

export function TimelineView({
  years,
  totalTrips,
  resolved,
  families,
  slideshowQuery,
}: {
  years: TimelineYear[];
  totalTrips: number;
  resolved: ResolvedFilter;
  families: FilterFamily[];
  slideshowQuery: ReturnType<typeof filterQuery>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQ = searchParams.get("q") ?? "";
  const inputRef = useRef<HTMLInputElement>(null);

  // The field keeps its own text so typing is instant; the URL follows.
  const [q, setQ] = useState(urlQ);
  const [seenUrlQ, setSeenUrlQ] = useState(urlQ);
  if (urlQ !== seenUrlQ) {
    // The URL changed from outside (back button): adopt it.
    setSeenUrlQ(urlQ);
    if (urlQ !== q.trim()) setQ(urlQ);
  }

  const query = q.trim();
  const shownYears = useMemo(() => searchYears(years, q), [years, q]);
  const shownTrips = useMemo(() => shownYears.flatMap((y) => y.trips), [shownYears]);

  function change(next: string) {
    setQ(next);
    const params = new URLSearchParams(window.location.search);
    if (next.trim()) params.set("q", next.trim());
    else params.delete("q");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }

  function clear() {
    change("");
    inputRef.current?.focus();
  }

  const subtitle = query
    ? `${shownTrips.length} of ${totalTrips} ${plural(totalTrips)}`
    : `${totalTrips} ${plural(totalTrips)}, newest first.`;

  return (
    <>
      <TimelineHeader subtitle={subtitle}>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div role="search" className="relative w-full sm:w-56 md:w-64">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              ref={inputRef}
              type="search"
              value={q}
              onChange={(e) => change(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && q) {
                  e.preventDefault();
                  change("");
                }
              }}
              placeholder="Title, place, note, person or year"
              aria-label="Search vacations"
              enterKeyHint="search"
              autoComplete="off"
              spellCheck={false}
              className="h-11 bg-card pr-11 pl-9 text-base md:h-8 md:pr-9 md:text-xs pointer-coarse:h-11 pointer-coarse:pr-11 [&::-webkit-search-cancel-button]:appearance-none"
            />
            {q && (
              <button
                type="button"
                onClick={clear}
                aria-label="Clear search"
                className="absolute top-0 right-0 grid size-11 place-items-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none md:size-8 pointer-coarse:size-11"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/vacations" />}
            className="h-11 px-4 md:h-8 md:px-2.5"
          >
            <Plane />
            All vacations
          </Button>
          <Button
            nativeButton={false}
            render={<Link href={{ pathname: "/slideshow", query: slideshowQuery }} />}
            className="h-11 px-4 md:h-8 md:px-2.5"
          >
            <Play />
            Play slideshow
          </Button>
        </div>
      </TimelineHeader>

      <PeopleFilter
        pathname="/timeline"
        resolved={resolved}
        families={families}
        keep={query ? { q: query } : undefined}
      />

      {shownTrips.length === 0 ? (
        <section className="mx-auto max-w-md px-6 py-16 text-center">
          <SearchX className="mx-auto size-10 text-muted-foreground" aria-hidden />
          <p className="font-hand mt-4 text-3xl break-words">No vacations match &quot;{query}&quot;</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Every word has to appear in a vacation&apos;s title, place, note, people or year. Try
            fewer words, or browse the full list.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button type="button" size="lg" className="h-11 md:h-9" onClick={clear}>
              Clear search
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-11 md:h-9"
              nativeButton={false}
              render={<Link href="/vacations" />}
            >
              Open the vacations overview
            </Button>
          </div>
        </section>
      ) : (
        <>
          <GlobeOfMemories
            trips={shownTrips}
            emptyHint={query ? "None of the matching vacations has a location yet." : undefined}
          />
          <Timeline years={shownYears} />
        </>
      )}
    </>
  );
}

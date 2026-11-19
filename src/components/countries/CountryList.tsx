"use client";

import { useState } from "react";
import { Check, ChevronRight, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CONTINENTS, COUNTRIES, type Country } from "@/lib/country-catalog";
import { countrySearchKey } from "@/lib/countries";
import { cn } from "@/lib/utils";

// What one row shows. Only the keys in `rows` are marked; everything else is
// a plain unmarked country.
export type RowState =
  | { kind: "visited"; year?: number | null }
  | { kind: "wishlist" }
  | { kind: "a" | "b" | "both"; label: string };

const SEARCHABLE = COUNTRIES.map((c) => ({ country: c, search: countrySearchKey(c.name) }));

// About 250 short rows, filtered in memory: no debounce and no virtualizing
// needed at this size (see the task report for the rule deviations).
export function CountryList({
  rows,
  editable = false,
  onToggle,
  onOpen,
}: {
  rows: Record<string, RowState>;
  editable?: boolean;
  onToggle?: (key: string, checked: boolean) => void;
  onOpen?: (key: string) => void;
}) {
  const [query, setQuery] = useState("");
  const needle = countrySearchKey(query.trim());
  const matches = needle ? SEARCHABLE.filter((s) => s.search.includes(needle)) : SEARCHABLE;
  const groups = CONTINENTS.map((continent) => ({
    continent,
    countries: matches.filter((s) => s.country.continent === continent).map((s) => s.country),
  })).filter((g) => g.countries.length > 0);

  return (
    <section aria-labelledby="country-list-heading" className="flex flex-col gap-4">
      <h2 id="country-list-heading" className="sr-only">
        All countries
      </h2>
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search countries..."
        aria-label="Search countries"
        className="h-11 rounded-md bg-card text-base sm:h-9 sm:text-sm md:text-sm"
      />
      {groups.length === 0 ? (
        <div className="flex flex-col items-start gap-2 py-4 text-sm text-muted-foreground">
          <p>No country matches &quot;{query.trim()}&quot;.</p>
          <Button variant="outline" className="h-11 sm:h-8" onClick={() => setQuery("")}>
            Clear search
          </Button>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.continent} aria-labelledby={`continent-${g.continent}`}>
            <h3
              id={`continent-${g.continent}`}
              className="font-hand sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 bg-background/95 py-1 text-2xl"
            >
              {g.continent}
            </h3>
            <ul className="divide-y divide-border/70">
              {g.countries.map((c) => (
                <Row
                  key={c.key}
                  country={c}
                  state={rows[c.key]}
                  editable={editable}
                  onToggle={onToggle}
                  onOpen={onOpen}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </section>
  );
}

function Row({
  country,
  state,
  editable,
  onToggle,
  onOpen,
}: {
  country: Country;
  state: RowState | undefined;
  editable: boolean;
  onToggle?: (key: string, checked: boolean) => void;
  onOpen?: (key: string) => void;
}) {
  const flag = (
    <span aria-hidden className="w-6 shrink-0 text-center text-lg leading-none">
      {country.flag}
    </span>
  );
  const year = state?.kind === "visited" && state.year ? (
    <span className="text-sm text-muted-foreground tabular-nums">{state.year}</span>
  ) : null;

  return (
    <li className="flex min-h-11 items-center gap-2">
      {editable ? (
        <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3">
          <Checkbox
            aria-label={country.name}
            checked={state?.kind === "visited"}
            onCheckedChange={(checked) => onToggle?.(country.key, checked)}
            className="size-5 rounded-sm data-checked:border-country-visited data-checked:bg-country-visited"
          />
          {flag}
          <span className="truncate">{country.name}</span>
        </label>
      ) : (
        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3">
          {flag}
          <span className="truncate">{country.name}</span>
        </div>
      )}
      {year}
      {state && state.kind !== "visited" && <Marker state={state} />}
      {state?.kind === "visited" && !editable && <Marker state={state} />}
      {onOpen && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Details for ${country.name}`}
          className="size-11 shrink-0 sm:size-9"
          onClick={() => onOpen(country.key)}
        >
          <ChevronRight />
        </Button>
      )}
    </li>
  );
}

const MARKER: Record<RowState["kind"], string> = {
  visited: "border-country-visited/40 bg-country-visited/10",
  wishlist: "border-country-wishlist/40 bg-country-wishlist/10",
  a: "border-country-a/40 bg-country-a/10",
  b: "border-country-b/40 bg-country-b/10",
  both: "border-country-both/40 bg-country-both/10",
};
const DOT: Record<RowState["kind"], string> = {
  visited: "bg-country-visited",
  wishlist: "bg-country-wishlist",
  a: "bg-country-a",
  b: "bg-country-b",
  both: "bg-country-both",
};

// Icon or swatch plus words: state is never colour alone.
function Marker({ state }: { state: RowState }) {
  const text =
    state.kind === "visited" ? "Visited" : state.kind === "wishlist" ? "Want to go" : state.label;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs text-foreground",
        MARKER[state.kind],
      )}
    >
      {state.kind === "visited" ? (
        <Check aria-hidden className="size-3.5 text-country-visited" />
      ) : state.kind === "wishlist" ? (
        <Star aria-hidden className="size-3.5 text-country-wishlist" />
      ) : (
        <span aria-hidden className={cn("size-2.5 rounded-full", DOT[state.kind])} />
      )}
      {text}
    </span>
  );
}

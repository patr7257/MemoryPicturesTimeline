"use client";

import { Plus, X } from "lucide-react";

import { countryByKey } from "@/lib/country-catalog";
import type { CountrySuggestion } from "@/lib/country-suggestions";

// Countries found in the GPS photos of this person's vacations. Nothing is
// marked until someone taps add. Rendered only when there are suggestions.
export function SuggestionChips({
  suggestions,
  onAdd,
  onDismiss,
}: {
  suggestions: CountrySuggestion[];
  onAdd: (s: CountrySuggestion) => void;
  onDismiss: (s: CountrySuggestion) => void;
}) {
  return (
    <section aria-labelledby="country-suggestions" className="flex flex-col gap-3">
      <h2 id="country-suggestions" className="font-hand text-2xl">
        From your vacations
      </h2>
      <ul className="flex flex-wrap gap-2">
        {suggestions.map((s) => {
          const name = countryByKey(s.countryKey)?.name ?? s.countryKey;
          return (
            <li
              key={s.countryKey}
              className="flex max-w-full items-stretch overflow-hidden rounded-full border border-country-visited/40 bg-card"
            >
              <button
                type="button"
                aria-label={`Add ${name}`}
                onClick={() => onAdd(s)}
                className="flex min-h-11 min-w-0 items-center gap-1.5 pr-1 pl-3 text-left text-sm outline-none hover:bg-country-visited/10 focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
              >
                <Plus aria-hidden className="size-4 shrink-0 text-country-visited" />
                <span className="font-medium">{name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {s.tripTitle}, {s.year}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Dismiss ${name}`}
                onClick={() => onDismiss(s)}
                className="flex min-h-11 w-11 shrink-0 items-center justify-center text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9 sm:w-9"
              >
                <X aria-hidden className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

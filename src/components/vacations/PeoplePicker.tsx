"use client";

// Toggle chips for tagging people on a vacation. Controlled: the parent owns
// the selected ids. New people are created on the Family page with their
// families, so there is no inline "add a person" here.
import { Check } from "lucide-react";

import { toggleId } from "@/lib/vacations-view";
import type { PersonRef } from "@/lib/queries";
import { cn } from "@/lib/utils";

export type PeoplePickerProps = {
  people: PersonRef[];
  value: string[];
  onChange: (personIds: string[]) => void;
  disabled?: boolean;
};

export const VISIBILITY_NOTE =
  "Only the people you tag here, anyone it is shared with, you, and the admins can see this vacation.";

export function PeoplePicker({ people, value, onChange, disabled = false }: PeoplePickerProps) {
  return (
    <div className="flex flex-col gap-3">
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">No people to tag yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label="People">
          {people.map((p) => {
            const on = value.includes(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => onChange(toggleId(value, p.id))}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50 md:min-h-8 md:px-3",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {on && <Check className="size-3.5" aria-hidden />}
                  {p.name}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">{VISIBILITY_NOTE}</p>
    </div>
  );
}

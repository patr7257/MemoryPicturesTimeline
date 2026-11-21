"use client";

// Toggle chips for tagging people on a vacation. Controlled: the parent owns
// the selected ids. New people are created on the Family page with their
// families, so there is no inline "add a person" here.
//
// Without `families` it is one flat row of name chips. With them it first shows
// a row of family chips; a family that has at least one person on lists its
// names underneath so single people can be switched off (and on again).
import { Check, Minus } from "lucide-react";

import { toggleId } from "@/lib/vacations-view";
import type { PersonRef } from "@/lib/queries";
import { groupShareTargets, groupState, toggleFamily } from "@/lib/share-rules";
import { cn } from "@/lib/utils";

export type PickerFamily = { id: string; name: string; memberIds: readonly string[] };

export type PeoplePickerProps = {
  people: PersonRef[];
  value: string[];
  onChange: (personIds: string[]) => void;
  disabled?: boolean;
  // The viewer's families (getViewerFamilies). Omit for the flat row.
  families?: PickerFamily[];
  // Already tagged people outside the viewer's families: shown under "Also on
  // this vacation", removable, never a way to add someone new.
  alsoOnIds?: string[];
  // Creating: say so while no family is picked yet.
  promptForFamily?: boolean;
};

export const VISIBILITY_NOTE =
  "Only the people you tag here, anyone it is shared with, you, and the admins can see this vacation.";
export const PICK_FAMILY_HINT = "Pick the family that was on this vacation";
// A vacation always keeps at least one person: the forms disable saving
// while nobody is ticked, and this line says why.
export const PICK_SOMEONE_HINT = "Pick at least one person";

function PickSomeone({ value }: { value: string[] }) {
  if (value.length > 0) return null;
  return <p className="text-sm text-muted-foreground">{PICK_SOMEONE_HINT}</p>;
}

const CHIP =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50 md:min-h-8 md:px-3";
const CHIP_ON = "border-primary bg-primary text-primary-foreground";
const CHIP_OFF = "border-border bg-card text-muted-foreground hover:text-foreground";
// Some on: outlined in the primary colour on a tint, with a minus mark.
const CHIP_MIXED = "border-primary bg-primary/15 text-foreground";

function NameChip({
  person,
  on,
  disabled,
  onToggle,
}: {
  person: PersonRef;
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onToggle}
      className={cn(CHIP, on ? CHIP_ON : CHIP_OFF)}
    >
      {on && <Check className="size-3.5" aria-hidden />}
      {person.name}
    </button>
  );
}

export function PeoplePicker({
  people,
  value,
  onChange,
  disabled = false,
  families,
  alsoOnIds = [],
  promptForFamily = false,
}: PeoplePickerProps) {
  if (people.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">No people to tag yet.</p>
        <p className="text-xs text-muted-foreground">{VISIBILITY_NOTE}</p>
      </div>
    );
  }

  if (!families) {
    return (
      <div className="flex flex-col gap-3">
        <ul className="flex flex-wrap gap-2" aria-label="People">
          {people.map((p) => (
            <li key={p.id}>
              <NameChip
                person={p}
                on={value.includes(p.id)}
                disabled={disabled}
                onToggle={() => onChange(toggleId(value, p.id))}
              />
            </li>
          ))}
        </ul>
        <PickSomeone value={value} />
        <p className="text-xs text-muted-foreground">{VISIBILITY_NOTE}</p>
      </div>
    );
  }

  const alsoOn = new Set(alsoOnIds);
  const alsoPeople = people.filter((p) => alsoOn.has(p.id));
  const groups = groupShareTargets(
    people.filter((p) => !alsoOn.has(p.id)),
    families,
  );
  const nothingOn = !people.some((p) => value.includes(p.id));

  return (
    <div className="flex flex-col gap-3">
      {groups.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Families">
          {groups.map((g) => {
            const state = groupState(
              g.people.map((p) => p.id),
              value,
            );
            return (
              <li key={g.id ?? "none"}>
                <button
                  type="button"
                  aria-pressed={state === "some" ? "mixed" : state === "all"}
                  disabled={disabled}
                  onClick={() =>
                    onChange(
                      toggleFamily(
                        value,
                        g.people.map((p) => p.id),
                      ),
                    )
                  }
                  className={cn(CHIP, state === "all" ? CHIP_ON : state === "some" ? CHIP_MIXED : CHIP_OFF)}
                >
                  {state === "all" && <Check className="size-3.5" aria-hidden />}
                  {state === "some" && <Minus className="size-3.5" aria-hidden />}
                  {g.name}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {promptForFamily && nothingOn && groups.length > 0 && (
        <p className="text-sm text-muted-foreground">{PICK_FAMILY_HINT}</p>
      )}

      {groups.map((g) => {
        const ids = g.people.map((p) => p.id);
        if (groupState(ids, value) === "none") return null;
        return (
          <ul
            key={g.id ?? "none"}
            aria-label={`${g.name}: who was there`}
            className="flex flex-wrap gap-2 border-l-2 border-border pl-3"
          >
            {g.people.map((p) => (
              <li key={p.id}>
                <NameChip
                  person={p}
                  on={value.includes(p.id)}
                  disabled={disabled}
                  onToggle={() => onChange(toggleId(value, p.id))}
                />
              </li>
            ))}
          </ul>
        );
      })}

      {alsoPeople.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Also on this vacation</span>
          <ul aria-label="Also on this vacation" className="flex flex-wrap gap-2">
            {alsoPeople.map((p) => (
              <li key={p.id}>
                <NameChip
                  person={p}
                  on={value.includes(p.id)}
                  disabled={disabled}
                  onToggle={() => onChange(toggleId(value, p.id))}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      <PickSomeone value={value} />
      <p className="text-xs text-muted-foreground">{VISIBILITY_NOTE}</p>
    </div>
  );
}

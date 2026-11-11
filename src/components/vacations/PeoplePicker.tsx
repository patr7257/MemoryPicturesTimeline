"use client";

// Toggle chips for tagging people on a vacation, with inline "add a person".
// Controlled: the parent owns the selected ids.
import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";

import { createPerson } from "@/actions/people";
import { toggleId } from "@/lib/vacations-view";
import type { PersonRef } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type PeoplePickerProps = {
  people: PersonRef[];
  value: string[];
  onChange: (personIds: string[]) => void;
  // Show the "add a person" row (default true).
  allowCreate?: boolean;
  disabled?: boolean;
};

export const VISIBILITY_NOTE =
  "Only the people you tag here, you, and the admins can see this vacation.";

export function PeoplePicker({
  people,
  value,
  onChange,
  allowCreate = true,
  disabled = false,
}: PeoplePickerProps) {
  const [added, setAdded] = useState<PersonRef[]>([]);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  const everyone = [...people, ...added.filter((a) => !people.some((p) => p.id === a.id))];

  async function addPerson() {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Reuse an existing person with the same name instead of duplicating.
    const existing = everyone.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      if (!value.includes(existing.id)) onChange([...value, existing.id]);
      setName("");
      return;
    }
    setAdding(true);
    try {
      const { id } = await createPerson(trimmed);
      setAdded((prev) => [...prev, { id, name: trimmed }]);
      onChange([...value, id]);
      setName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add that person");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {everyone.length === 0 ? (
        <p className="text-sm text-muted-foreground">No people yet. Add the first one below.</p>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label="People">
          {everyone.map((p) => {
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

      {allowCreate && (
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addPerson();
              }
            }}
            placeholder="Add someone new"
            aria-label="Name of a new person"
            maxLength={60}
            disabled={disabled || adding}
            className="h-11 text-base md:h-8 md:text-xs"
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled || adding || !name.trim()}
            onClick={() => void addPerson()}
            className="h-11 px-4 md:h-8 md:px-2.5"
          >
            <Plus />
            Add
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{VISIBILITY_NOTE}</p>
    </div>
  );
}

"use client";

import { useId } from "react";

// A labelled group of checkboxes: the multi-select used for the people of a
// family and the families of a person. Rows are 44px tall on touch.
export function FamilyChecks({
  legend,
  options,
  selected,
  disabled,
  onChange,
}: {
  legend: string;
  options: readonly { id: string; name: string }[];
  selected: readonly string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}) {
  const base = useId();
  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">{legend}: none to choose from yet.</p>;
  }
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <ul className="grid gap-x-4 sm:grid-cols-2">
        {options.map((o) => {
          const id = `${base}-${o.id}`;
          const on = selected.includes(o.id);
          return (
            <li key={o.id}>
              <label htmlFor={id} className="flex min-h-11 items-center gap-3 text-sm sm:min-h-8">
                <input
                  id={id}
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    onChange(on ? selected.filter((x) => x !== o.id) : [...selected, o.id])
                  }
                  className="size-5 sm:size-4"
                />
                <span className="min-w-0 truncate">{o.name}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

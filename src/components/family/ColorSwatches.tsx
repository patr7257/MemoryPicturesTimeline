"use client";

import { Check } from "lucide-react";

import { PALETTE } from "@/lib/person-colors";
import { cn } from "@/lib/utils";

// One swatch per palette colour. Taken colours (another person has them) are
// disabled; the person's own is selected. Picking the selected one again
// clears it, so a colour can be given back.
export function ColorSwatches({
  label,
  current,
  takenKeys,
  disabled,
  onPick,
}: {
  label: string;
  current: string | null;
  takenKeys: ReadonlySet<string>;
  disabled?: boolean;
  onPick: (key: string | null) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {PALETTE.map((c) => {
        const selected = current === c.key;
        const taken = !selected && takenKeys.has(c.key);
        return (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={taken ? `${c.name}, taken by someone else` : c.name}
            title={c.name}
            disabled={disabled || taken}
            onClick={() => onPick(selected ? null : c.key)}
            className={cn(
              "flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed sm:size-8",
              taken && "opacity-30",
            )}
          >
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full border border-black/10 text-white sm:size-6",
                selected && "ring-2 ring-foreground ring-offset-2 ring-offset-card",
              )}
              style={{ backgroundColor: c.hex }}
            >
              {selected && <Check className="size-4" aria-hidden="true" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

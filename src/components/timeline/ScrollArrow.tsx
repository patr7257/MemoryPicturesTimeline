"use client";

// The arrow pinned to one end of a scroll area, over a soft fade so whatever
// slides under it never looks cut by the button. Rendered only when there is
// more in that direction. Out of the tab order (keyboard users move through
// the items themselves, which scroll into view), but a real button with a
// name for pointer and screen reader users. 36px on a mouse, 44px on touch.
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";

const ICONS = { up: ChevronUp, down: ChevronDown, left: ChevronLeft, right: ChevronRight };

const PLACE = {
  up: "inset-x-0 top-0 h-14 items-start justify-center bg-linear-to-b",
  down: "inset-x-0 bottom-0 h-14 items-end justify-center bg-linear-to-t",
  left: "inset-y-0 left-0 w-16 items-center justify-start bg-linear-to-r",
  right: "inset-y-0 right-0 w-16 items-center justify-end bg-linear-to-l",
};

export function ScrollArrow({
  direction,
  label,
  onPress,
}: {
  direction: keyof typeof ICONS;
  label: string;
  onPress: () => void;
}) {
  const Icon = ICONS[direction];
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-10 flex from-background from-35% to-transparent",
        PLACE[direction],
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={label}
        onClick={onPress}
        className="pointer-events-auto grid size-9 place-items-center rounded-full border border-border bg-card text-foreground shadow-[0_2px_8px_var(--paper-shadow)] transition-colors hover:bg-accent pointer-coarse:size-11"
      >
        <Icon className="size-5" aria-hidden />
      </button>
    </div>
  );
}

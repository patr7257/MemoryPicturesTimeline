"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, Plus, Search } from "lucide-react";

import type { TripOption } from "@/lib/queries";
import { searchTrips } from "@/lib/trip-search";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export const NEW_TRIP = "new";

function describe(t: TripOption): string {
  return [t.startDate.slice(0, 4), t.locationName].filter(Boolean).join(" · ");
}

// A searchable list of vacations plus a "new vacation" row. The list is always
// open and inline (no popover), so a phone keyboard never covers it and no
// hover is needed. ARIA combobox with a listbox; focus stays in the text field.
export function TripPicker({
  options,
  value,
  onChange,
  disabled,
}: {
  options: TripOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const uid = useId();
  const listId = `${uid}-list`;
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => searchTrips(options, query), [options, query]);
  // Row ids in display order: matches, then the "new vacation" row.
  const rowIds = [...matches.map((t) => t.id), NEW_TRIP];
  const activeId = rowIds[Math.min(active, rowIds.length - 1)];
  const optionDomId = (id: string) => `${uid}-opt-${id}`;

  const chosen = options.find((t) => t.id === value);

  function pick(id: string) {
    onChange(id);
    setQuery("");
    setActive(0);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % rowIds.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + rowIds.length) % rowIds.length);
    } else if (e.key === "Enter") {
      // Never submit a surrounding form with Enter.
      e.preventDefault();
      pick(activeId);
    } else if (e.key === "Escape") {
      if (query) {
        e.preventDefault();
        setQuery("");
        setActive(0);
      }
    }
  }

  // The on-screen keyboard covers the lower half of a phone: bring the field
  // to the top once it has slid up so the first results stay visible.
  function onFocus() {
    window.setTimeout(() => {
      const el = rootRef.current;
      if (!el || document.activeElement !== inputRef.current) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    }, 300);
  }

  return (
    <div ref={rootRef} className="flex scroll-mt-4 flex-col gap-2">
      <p role="status" className="text-sm text-muted-foreground">
        Adding to:{" "}
        <span className="font-medium text-foreground">
          {value === NEW_TRIP ? "a new vacation" : chosen ? `${chosen.title} (${describe(chosen)})` : "no vacation chosen"}
        </span>
      </p>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          ref={inputRef}
          id="trip"
          type="text"
          role="combobox"
          aria-label="Search vacations"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={optionDomId(activeId)}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="Search by title, place or year"
          disabled={disabled}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          className="h-11 rounded-md bg-card pl-9 text-base md:h-9 md:text-sm"
        />
      </div>
      <ul
        id={listId}
        role="listbox"
        aria-label="Vacations"
        className="max-h-72 overflow-y-auto overscroll-contain rounded-md border bg-card"
      >
        {matches.map((t) => (
          <Row
            key={t.id}
            id={optionDomId(t.id)}
            selected={t.id === value}
            active={t.id === activeId}
            onPick={() => pick(t.id)}
            disabled={disabled}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base md:text-sm">{t.title}</span>
              <span className="block truncate text-sm text-muted-foreground md:text-xs">{describe(t)}</span>
            </span>
          </Row>
        ))}
        {matches.length === 0 && (
          <li role="presentation" className="px-3 py-3 text-sm text-muted-foreground">
            No vacation matches &quot;{query.trim()}&quot;. Clear the search or add a new vacation.
          </li>
        )}
        <Row
          id={optionDomId(NEW_TRIP)}
          selected={value === NEW_TRIP}
          active={activeId === NEW_TRIP}
          onPick={() => pick(NEW_TRIP)}
          disabled={disabled}
        >
          <Plus aria-hidden className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-base md:text-sm">New vacation...</span>
        </Row>
      </ul>
    </div>
  );
}

function Row({
  id,
  selected,
  active,
  onPick,
  disabled,
  children,
}: {
  id: string;
  selected: boolean;
  active: boolean;
  onPick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onPick}
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-2 border-l-4 border-transparent px-3 py-1.5 select-none",
        "border-b last:border-b-0",
        active && "border-l-ring bg-muted",
        selected && "font-medium",
      )}
    >
      {children}
      {selected && <Check aria-hidden className="size-4 shrink-0 text-primary" />}
    </li>
  );
}

"use client";

// Year jump control for a long timeline. Below xl: a sticky, horizontally
// scrollable chip row under the top bar. From xl up: a sticky rail in the
// left margin of the timeline. The active year follows the scroll position.
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export const yearAnchor = (year: number) => `year-${year}`;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type YearSpy = {
  active: number | null;
  jump: (year: number) => void;
  rowRef: React.RefObject<HTMLUListElement | null>;
};

export function useYearSpy(years: number[]): YearSpy {
  const [active, setActive] = useState<number | null>(years[0] ?? null);
  const rowRef = useRef<HTMLUListElement>(null);

  // Scrollspy: the year section crossing the upper third of the viewport.
  useEffect(() => {
    const sections = years
      .map((y) => document.getElementById(yearAnchor(y)))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number(entry.target.id.slice("year-".length)));
        }
      },
      { rootMargin: "-25% 0px -65% 0px" },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [years]);

  // Keep the active chip visible inside the horizontal row.
  useEffect(() => {
    const row = rowRef.current;
    const chip = row?.querySelector<HTMLElement>("[data-active='true']");
    if (!row || !chip || row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({
      left: chip.offsetLeft - (row.clientWidth - chip.clientWidth) / 2,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [active]);

  function jump(year: number) {
    setActive(year);
    document
      .getElementById(yearAnchor(year))
      ?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }

  return { active, jump, rowRef };
}

function YearButton({
  year,
  spy,
  className,
}: {
  year: number;
  spy: YearSpy;
  className: string;
}) {
  const { active, jump } = spy;
  return (
    <button
      type="button"
      data-active={active === year}
      aria-current={active === year ? "true" : undefined}
      onClick={() => jump(year)}
      className={cn(
        "font-hand transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        active === year
          ? "bg-primary text-primary-foreground"
          : "bg-card text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {year}
    </button>
  );
}

// Phones, tablets and small laptops: sticky chip row under the top bar. Render
// it as a direct child of the page body so it stays stuck for the whole timeline.
export function YearChips({ years, spy }: { years: number[]; spy: YearSpy }) {
  if (years.length < 2) return null;
  return (
    <nav
      aria-label="Jump to year"
      className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 border-b border-border/60 bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/75 xl:hidden"
    >
      <ul
        ref={spy.rowRef}
        className="mx-auto flex max-w-5xl snap-x gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden"
      >
        {years.map((y) => (
          <li key={y} className="snap-start">
            <YearButton
              year={y}
              spy={spy}
              className="flex min-h-11 min-w-16 items-center justify-center rounded-full border border-border px-4 text-xl"
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

// Wide desktops: sticky rail in the left margin of the timeline column. Render
// it inside the timeline container (position: relative).
export function YearRail({ years, spy }: { years: number[]; spy: YearSpy }) {
  if (years.length < 2) return null;
  return (
    <nav
      aria-label="Jump to year"
      className="pointer-events-none absolute top-0 right-full bottom-0 hidden w-24 xl:block"
    >
      <ul className="pointer-events-auto sticky top-[calc(3.5rem+env(safe-area-inset-top)+1.5rem)] flex flex-col items-end gap-1 pr-2">
        {years.map((y) => (
          <li key={y}>
            <YearButton
              year={y}
              spy={spy}
              className="min-w-16 rounded-sm px-3 py-1 text-right text-2xl shadow-[0_1px_4px_var(--paper-shadow)]"
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

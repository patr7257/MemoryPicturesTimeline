"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Country } from "@/lib/country-catalog";
import type { Hex } from "@/lib/person-colors";
import { cn } from "@/lib/utils";

// Read-only card for the multi-person map: who of the shown people has been
// to this country. Same sheet and dialog frame as CountryCard. Each name
// carries its colour swatch, and the words alone say everything.
export function VisitorsCard({
  country,
  visitors,
  onClose,
}: {
  country: Country;
  visitors: { name: string; color: Hex }[];
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          "top-auto bottom-0 left-0 max-w-none translate-x-0 translate-y-0 gap-5 rounded-t-xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-sm",
          "sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg",
        )}
      >
        <DialogHeader className="pr-10">
          <DialogTitle className="font-hand flex items-center gap-2 text-3xl leading-tight">
            <span aria-hidden className="text-2xl">
              {country.flag}
            </span>
            {country.name}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {visitors.length === 0 ? "None of them have been here yet." : "Visited by"}
          </DialogDescription>
        </DialogHeader>
        {visitors.length > 0 && (
          <ul className="flex flex-col gap-2">
            {visitors.map((v, i) => (
              <li key={`${i}:${v.name}`} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full ring-1 ring-black/10"
                  style={{ backgroundColor: v.color }}
                />
                {v.name}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

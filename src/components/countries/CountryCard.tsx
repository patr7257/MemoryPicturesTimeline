"use client";

import { useState } from "react";
import { Check, Star, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CountriesTier } from "@/lib/access-policy";
import type { Country } from "@/lib/country-catalog";
import { NOTE_MAX, type CountryMark } from "@/lib/countries";
import { cn } from "@/lib/utils";

// One country: a bottom sheet on phones, a centred dialog from sm up. Opened
// from a list row now and from a map tap later. `mark` never holds a
// dismissed row (the view filters those out).
export function CountryCard({
  country,
  mark,
  tier,
  onClose,
  onStatus,
  onRemove,
  onSaveYear,
  onSaveNote,
}: {
  country: Country;
  mark: CountryMark | null;
  tier: CountriesTier;
  onClose: () => void;
  onStatus: (status: "visited" | "wishlist") => void;
  onRemove: () => Promise<string | null>;
  onSaveYear: (raw: string) => Promise<string | null>;
  onSaveNote: (note: string) => Promise<string | null>;
}) {
  const editable = tier !== "view";
  const visited = mark?.status === "visited";
  const wishlist = mark?.status === "wishlist";

  const [year, setYear] = useState(mark?.year ? String(mark.year) : "");
  const [yearError, setYearError] = useState<string | null>(null);
  const [note, setNote] = useState(mark?.note ?? "");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  async function commitYear() {
    const current = mark?.year ? String(mark.year) : "";
    if (year === current) return;
    setYearError(await onSaveYear(year));
  }

  async function commitNote() {
    if (note.trim() === (mark?.note ?? "")) return;
    setNoteError(await onSaveNote(note));
  }

  async function remove() {
    setRemoving(true);
    const err = await onRemove();
    setRemoving(false);
    setRemoveError(err);
  }

  const summary = visited
    ? mark?.year
      ? `Visited in ${mark.year}`
      : "Visited"
    : wishlist
      ? "On the want to go list"
      : "Not visited";

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
          <DialogDescription className="text-sm">{summary}</DialogDescription>
        </DialogHeader>

        {editable ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={visited ? "default" : "outline"}
                aria-pressed={visited}
                className="h-11 px-4 sm:h-9"
                onClick={() => !visited && onStatus("visited")}
              >
                <Check data-icon="inline-start" /> Visited
              </Button>
              <Button
                variant={wishlist ? "default" : "outline"}
                aria-pressed={wishlist}
                className={cn(
                  "h-11 px-4 sm:h-9",
                  wishlist && "bg-country-wishlist text-primary-foreground hover:bg-country-wishlist/85",
                )}
                onClick={() => !wishlist && onStatus("wishlist")}
              >
                <Star data-icon="inline-start" /> Want to go
              </Button>
              <Button
                variant="destructive"
                className="h-11 px-4 sm:h-9"
                disabled={!mark || removing}
                onClick={remove}
              >
                <Trash2 data-icon="inline-start" /> Remove
              </Button>
            </div>
            {removeError && (
              <p role="alert" className="text-destructive">
                {removeError}
              </p>
            )}

            {visited && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="country-year" className="text-sm">
                  Year
                </Label>
                <Input
                  id="country-year"
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="off"
                  placeholder="e.g. 2019"
                  value={year}
                  aria-invalid={yearError ? true : undefined}
                  aria-describedby={yearError ? "country-year-error" : undefined}
                  onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))}
                  onBlur={commitYear}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void commitYear();
                    }
                  }}
                  className="h-11 w-32 rounded-md bg-card text-base tabular-nums sm:h-9 sm:text-sm md:text-sm"
                />
                {yearError && (
                  <p id="country-year-error" role="alert" className="text-destructive">
                    {yearError}
                  </p>
                )}
              </div>
            )}

            {tier === "edit_notes" && mark && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="country-note" className="text-sm">
                  Note
                </Label>
                <Textarea
                  id="country-note"
                  maxLength={NOTE_MAX}
                  value={note}
                  aria-invalid={noteError ? true : undefined}
                  aria-describedby={noteError ? "country-note-error" : undefined}
                  onChange={(e) => setNote(e.target.value)}
                  onBlur={commitNote}
                  className="min-h-20 rounded-md bg-card text-base sm:text-sm md:text-sm"
                />
                {noteError && (
                  <p id="country-note-error" role="alert" className="text-destructive">
                    {noteError}
                  </p>
                )}
              </div>
            )}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

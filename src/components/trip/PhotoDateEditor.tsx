"use client";

// Inline form on the postcard back for when a photo was taken: a date and an
// optional time, both the photographer's wall clock. Empty date means "Date
// unknown". Escape cancels and stops there (it must not close the dialog),
// Enter saves. Validation lives in parseTakenAt so client and server agree.
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type PhotoDateEditorProps = {
  id: string;
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  pending: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
};

export function PhotoDateEditor({
  id,
  date,
  time,
  onDateChange,
  onTimeChange,
  pending,
  error,
  onSave,
  onCancel,
}: PhotoDateEditorProps) {
  const dateInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    dateInput.current?.focus({ preventScroll: true });
  }, []);

  const describedBy = error ? `${id}-error` : `${id}-hint`;

  return (
    <form
      className="flex flex-col gap-2 font-sans"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending) onSave();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          if (!pending) onCancel();
        }
      }}
    >
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-date`} className="text-neutral-700">
            Date
          </Label>
          <Input
            ref={dateInput}
            id={`${id}-date`}
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            disabled={pending}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className="min-h-11 w-44 bg-white text-base text-neutral-900 md:text-base"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-time`} className="text-neutral-700">
            Time <span className="font-normal text-neutral-600">(optional)</span>
          </Label>
          <Input
            id={`${id}-time`}
            type="time"
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
            disabled={pending}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className="min-h-11 w-32 bg-white text-base text-neutral-900 md:text-base"
          />
        </div>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="text-xs text-neutral-600">
          The photo moves to that day. Leave the date empty if it is unknown.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 px-4 sm:min-h-9"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" className="min-h-11 px-4 sm:min-h-9" disabled={pending}>
          {pending ? "Saving..." : "Save date"}
        </Button>
      </div>
    </form>
  );
}

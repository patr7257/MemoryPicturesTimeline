"use client";

// The shared form body for creating and quick-editing a vacation: title,
// dates, place, notes and the people picker. Controlled by the parent.
import { useId } from "react";

import type { VacationDraft } from "@/lib/vacations-view";
import type { PersonRef } from "@/lib/queries";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PeoplePicker } from "./PeoplePicker";

// 16px text on touch layouts stops iOS from zooming into the field on focus.
export const FIELD = "h-11 text-base md:h-8 md:text-xs";

export type VacationFieldsProps = {
  value: VacationDraft;
  onChange: (next: VacationDraft) => void;
  people: PersonRef[];
  disabled?: boolean;
};

export function VacationFields({ value, onChange, people, disabled }: VacationFieldsProps) {
  const uid = useId();
  const set = <K extends keyof VacationDraft>(key: K, v: VacationDraft[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-title`}>Title</Label>
        <Input
          id={`${uid}-title`}
          value={value.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Summer in Italy"
          disabled={disabled}
          className={FIELD}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-start`}>Start date</Label>
          <Input
            id={`${uid}-start`}
            type="date"
            value={value.startDate}
            onChange={(e) => set("startDate", e.target.value)}
            disabled={disabled}
            className={FIELD}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-end`}>End date (optional)</Label>
          <Input
            id={`${uid}-end`}
            type="date"
            min={value.startDate || undefined}
            value={value.endDate}
            onChange={(e) => set("endDate", e.target.value)}
            disabled={disabled}
            className={FIELD}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-place`}>Place (optional)</Label>
        <Input
          id={`${uid}-place`}
          value={value.locationName}
          onChange={(e) => set("locationName", e.target.value)}
          placeholder="Lake Garda, Italy"
          disabled={disabled}
          className={FIELD}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-notes`}>Notes (optional)</Label>
        <Textarea
          id={`${uid}-notes`}
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Who came along, what you did, what to remember"
          disabled={disabled}
          className="min-h-24 text-base md:min-h-16 md:text-xs"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2 text-xs leading-none">Who was there</span>
        <PeoplePicker
          people={people}
          value={value.personIds}
          onChange={(personIds) => set("personIds", personIds)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

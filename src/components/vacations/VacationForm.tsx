"use client";

// Stand-alone "new vacation" form: fields plus Create, saved through
// createTrip with the tagged people included.
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createTrip } from "@/actions/trips";
import { draftError, emptyDraft } from "@/lib/vacations-view";
import type { PersonRef } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { VacationFields } from "./VacationFields";

export type VacationFormProps = {
  people: PersonRef[];
  // Preselected as tagged (the viewer's own person), when they have one.
  viewerPersonId: string | null;
  // Called with the new vacation's id after it was created.
  onCreated: (tripId: string) => void;
  onCancel?: () => void;
};

export function VacationForm({ people, viewerPersonId, onCreated, onCancel }: VacationFormProps) {
  const [draft, setDraft] = useState(() => emptyDraft(viewerPersonId));
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = draftError(draft);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    try {
      const { id } = await createTrip({
        title: draft.title,
        startDate: draft.startDate,
        endDate: draft.endDate || null,
        locationName: draft.locationName || null,
        description: draft.description || null,
        personIds: draft.personIds,
      });
      toast.success("Vacation created");
      onCreated(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the vacation");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5">
      <VacationFields value={draft} onChange={setDraft} people={people} disabled={busy} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={busy}
            className="h-11 md:h-8"
          >
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={busy} className="h-11 md:h-8">
          {busy && <Loader2 className="animate-spin" />}
          Create vacation
        </Button>
      </div>
    </form>
  );
}

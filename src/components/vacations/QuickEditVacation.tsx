"use client";

// Edit a vacation in place from the overview: details through updateTrip,
// tagged people through setTripPeople, then the list refreshes.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { setTripPeople, updateTrip } from "@/actions/trips";
import { draftError, sameIds, type VacationDraft, type VacationListItem } from "@/lib/vacations-view";
import type { PersonRef } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "./ResponsiveDialog";
import { VacationFields } from "./VacationFields";

function draftFrom(trip: VacationListItem): VacationDraft {
  return {
    title: trip.title,
    startDate: trip.startDate,
    endDate: trip.endDate ?? "",
    locationName: trip.locationName ?? "",
    description: trip.description ?? "",
    personIds: trip.people.map((p) => p.id),
  };
}

export function QuickEditVacation({
  trip,
  people,
  onClose,
}: {
  // The vacation being edited; null keeps the dialog closed.
  trip: VacationListItem | null;
  people: PersonRef[];
  onClose: () => void;
}) {
  return (
    <ResponsiveDialog
      open={trip !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Quick edit"
      description="Change the details and who can see this vacation."
    >
      {/* keyed so a different vacation always starts from its own values */}
      {trip && <EditBody key={trip.id} trip={trip} people={people} onClose={onClose} />}
    </ResponsiveDialog>
  );
}

function EditBody({
  trip,
  people,
  onClose,
}: {
  trip: VacationListItem;
  people: PersonRef[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => draftFrom(trip));
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const problem = draftError(draft);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    try {
      await updateTrip({
        id: trip.id,
        title: draft.title,
        startDate: draft.startDate,
        endDate: draft.endDate || null,
        locationName: draft.locationName || null,
        description: draft.description || null,
      });
      if (!sameIds(draft.personIds, trip.people.map((p) => p.id))) {
        await setTripPeople(trip.id, draft.personIds);
      }
      toast.success("Saved");
      router.refresh();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="flex flex-col gap-5">
      <VacationFields value={draft} onChange={setDraft} people={people} disabled={busy} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button
          variant="ghost"
          nativeButton={false}
          render={<Link href={`/trips/${trip.id}/edit`} />}
          className="h-11 sm:mr-auto md:h-8"
        >
          <ExternalLink />
          Full edit page
        </Button>
        <Button type="button" variant="outline" onClick={onClose} disabled={busy} className="h-11 md:h-8">
          Cancel
        </Button>
        <Button type="submit" disabled={busy} className="h-11 md:h-8">
          {busy && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </div>
    </form>
  );
}

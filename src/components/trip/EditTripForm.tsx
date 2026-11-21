"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteTrip, setTripPeople, updateTrip } from "@/actions/trips";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PeoplePicker, type PickerFamily } from "@/components/vacations/PeoplePicker";
import { needsSomeone, outsideFamilies } from "@/lib/share-rules";
import type { TripSharing } from "@/lib/share-queries";
import { ShareWithPeople } from "./ShareWithPeople";

type Person = { id: string; name: string };

export function EditTripForm({
  trip,
  allPeople,
  taggedIds,
  sharing,
  families,
}: {
  trip: {
    id: string;
    title: string;
    startDate: string;
    endDate: string | null;
    locationName: string | null;
    description: string | null;
  };
  allPeople: Person[];
  taggedIds: string[];
  sharing?: TripSharing;
  families?: PickerFamily[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(trip.title);
  const [startDate, setStartDate] = useState(trip.startDate);
  const [endDate, setEndDate] = useState(trip.endDate ?? "");
  const [locationName, setLocationName] = useState(trip.locationName ?? "");
  const [description, setDescription] = useState(trip.description ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(taggedIds);
  // Already tagged people outside the viewer's families stay removable.
  const alsoOnIds = families ? outsideFamilies(taggedIds, families) : undefined;

  function save() {
    startTransition(async () => {
      try {
        await updateTrip({
          id: trip.id,
          title,
          startDate,
          endDate: endDate || null,
          locationName: locationName || null,
          description: description || null,
        });
        const res = await setTripPeople(trip.id, selected);
        if (!res.ok) {
          // The details are saved; the people are not. Stay on the form.
          toast.error(res.error, { duration: Infinity, closeButton: true });
          router.refresh();
          return;
        }
        toast.success("Vacation saved");
        router.push(`/trips/${trip.id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed", {
          duration: Infinity,
          closeButton: true,
        });
      }
    });
  }

  function remove() {
    startTransition(async () => {
      try {
        await deleteTrip(trip.id);
        toast.success("Vacation deleted");
        router.push("/vacations");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delete failed");
        setConfirmOpen(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="start">Start date</Label>
          <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="end">End date (optional)</Label>
          <Input id="end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="location">Place</Label>
        <Input id="location" value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="Lake Garda, Italy" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Notes</Label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="border-input rounded-md border bg-transparent px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Who was along?</Label>
        {allPeople.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No people to tag yet; add them on the Family page first.
          </p>
        ) : (
          <PeoplePicker
            people={allPeople}
            value={selected}
            onChange={setSelected}
            disabled={pending}
            families={families && families.length > 0 ? families : undefined}
            alsoOnIds={alsoOnIds}
          />
        )}
      </div>

      {sharing?.canShare && sharing.targets.length > 0 && (
        <div className="flex flex-col items-start gap-2">
          <Label>Shared with</Label>
          <ShareWithPeople tripId={trip.id} groups={sharing.groups} sharedIds={sharing.sharedIds} />
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button
          variant="destructive"
          className="min-h-11 sm:min-h-8"
          onClick={() => setConfirmOpen(true)}
          disabled={pending}
        >
          <Trash2 data-icon="inline-start" />
          Delete vacation
        </Button>
        <Button onClick={save} disabled={pending || needsSomeone(selected)} size="lg" className="min-h-11 sm:min-h-9">
          {pending ? "Saving..." : "Save vacation"}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{trip.title}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              The vacation, all its photos and notes are removed for everyone. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 sm:min-h-8" disabled={pending}>
              Keep it
            </AlertDialogCancel>
            <Button
              variant="destructive"
              className="min-h-11 sm:min-h-8"
              onClick={remove}
              disabled={pending}
            >
              {pending ? "Deleting..." : "Delete vacation"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

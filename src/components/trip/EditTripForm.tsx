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

type Person = { id: string; name: string };

export function EditTripForm({
  trip,
  allPeople,
  taggedIds,
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
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(trip.title);
  const [startDate, setStartDate] = useState(trip.startDate);
  const [endDate, setEndDate] = useState(trip.endDate ?? "");
  const [locationName, setLocationName] = useState(trip.locationName ?? "");
  const [description, setDescription] = useState(trip.description ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(taggedIds));

  function togglePerson(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
        await setTripPeople(trip.id, Array.from(selected));
        toast.success("Vacation saved");
        router.push(`/trips/${trip.id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed");
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
            No people yet; add them on the People page first.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {allPeople.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePerson(p.id)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  selected.has(p.id)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

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
        <Button onClick={save} disabled={pending} size="lg" className="min-h-11 sm:min-h-9">
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

"use client";

// Set where a photo was taken: a map in a dialog (tap or drag the pin), plus
// a one-tap "same place as a nearby photo" shortcut. The map chunk loads only
// when the dialog opens. Touch events stop here so dragging the map never
// swipes the photo viewer behind it.
import { useState } from "react";
import dynamic from "next/dynamic";
import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { LatLngPoint } from "@/lib/photo-location";

const PickerMap = dynamic(() => import("./PickerMap"), {
  ssr: false,
  loading: () => (
    <div role="status" className="grid size-full place-items-center text-sm text-muted-foreground">
      Loading the map
    </div>
  ),
});

export type LocationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  start: { lat: number; lng: number; zoom: number };
  // The photo's current spot, if it has one.
  current: LatLngPoint | null;
  // The located photo closest in time, for the shortcut.
  nearby: (LatLngPoint & { label: string }) | null;
  pending: boolean;
  error: string | null;
  onSave: (point: LatLngPoint) => void;
};

export function LocationDialog({
  open,
  onOpenChange,
  start,
  current,
  nearby,
  pending,
  error,
  onSave,
}: LocationDialogProps) {
  const [point, setPoint] = useState<LatLngPoint | null>(current);
  const [focusKey, setFocusKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPoint(current);
      setFocusKey(0);
    }
  }

  const changed = point !== null && (current === null || point.lat !== current.lat || point.lng !== current.lng);

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent
        className="flex w-full max-w-[calc(100%-1rem)] flex-col gap-3 p-3 sm:max-w-2xl sm:p-4"
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1 pr-8">
          <DialogTitle className="text-base">Where was this photo taken?</DialogTitle>
          <DialogDescription>Tap the map to place the pin, or drag it. Zoom in for the exact spot.</DialogDescription>
        </div>
        <div className="h-[55dvh] min-h-64 overflow-hidden rounded-md border">
          {open && <PickerMap start={start} point={point} onPick={setPoint} focusKey={focusKey} />}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {nearby ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 justify-start sm:min-h-9"
              disabled={pending}
              onClick={() => {
                setPoint({ lat: nearby.lat, lng: nearby.lng });
                setFocusKey((k) => k + 1);
              }}
            >
              <Copy data-icon="inline-start" />
              <span className="truncate">Same place as {nearby.label}</span>
            </Button>
          ) : (
            <span />
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 px-4 sm:min-h-9"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="min-h-11 px-4 sm:min-h-9"
              disabled={pending || !changed}
              onClick={() => point && onSave(point)}
            >
              {pending ? "Saving..." : "Save location"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

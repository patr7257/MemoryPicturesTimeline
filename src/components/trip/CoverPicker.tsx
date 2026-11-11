"use client";

// Pick which photo represents the vacation on the timeline and map. Applies
// immediately (it is its own action, not part of the form's Save).
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { updateTrip } from "@/actions/trips";
import { Button } from "@/components/ui/button";
import { imgUrl } from "@/lib/img-url";
import { cn } from "@/lib/utils";

export function CoverPicker({
  tripId,
  photos,
  coverPhotoId,
}: {
  tripId: string;
  // In display order; the first is the automatic cover.
  photos: { id: string }[];
  coverPhotoId: string | null;
}) {
  // A stored id that no longer matches a photo counts as "automatic".
  const initial = photos.some((p) => p.id === coverPhotoId) ? coverPhotoId : null;
  const [chosen, setChosen] = useState<string | null>(initial);
  const [pending, startTransition] = useTransition();

  if (photos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add photos to this vacation to choose a cover.
      </p>
    );
  }

  const effective = chosen ?? photos[0].id;

  function choose(id: string | null) {
    startTransition(async () => {
      try {
        await updateTrip({ id: tripId, coverPhotoId: id });
        setChosen(id);
        toast.success(id ? "Cover photo changed" : "Using the first photo as cover");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not change the cover");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {photos.map((p) => {
          const current = p.id === effective;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => choose(p.id)}
                disabled={pending}
                aria-pressed={current}
                aria-label={current ? "Current cover photo" : "Use as cover photo"}
                className={cn(
                  "relative block aspect-square w-full overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  current ? "ring-2 ring-primary" : "opacity-90 hover:opacity-100",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgUrl(p.id, 400)}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover"
                />
                {current && (
                  <span className="absolute top-1 left-1 inline-flex items-center gap-1 bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
                    <Check className="size-3" aria-hidden />
                    Cover
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div>
        <Button
          variant="outline"
          className="min-h-11 sm:min-h-8"
          onClick={() => choose(null)}
          disabled={pending || chosen === null}
        >
          Use first photo
        </Button>
      </div>
    </div>
  );
}

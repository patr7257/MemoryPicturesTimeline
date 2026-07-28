"use client";

// A scattered, slightly overlapping pile of up to 5 polaroids for one trip.
import { PolaroidCard, type PolaroidPhoto } from "./PolaroidCard";

export function PhotoCluster({ photos }: { photos: PolaroidPhoto[] }) {
  if (photos.length === 0) return null;
  return (
    <div className="flex flex-wrap items-start justify-center gap-y-3 -space-x-6 py-2 sm:-space-x-8">
      {photos.map((p, i) => (
        <PolaroidCard key={p.id} photo={p} index={i} className={i % 2 === 1 ? "mt-6" : ""} />
      ))}
    </div>
  );
}

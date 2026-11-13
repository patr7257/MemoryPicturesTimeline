"use client";

// One day of a vacation as a single row of equal square tiles (160px on a
// phone, 240px from the sm breakpoint) that scrolls sideways. Every row has
// the same height whatever its photo count, and photos are cropped to fill
// (the full photo shows when opened). Touch and trackpads scroll natively;
// mouse users get arrow buttons that appear only when there is more to see.
import { useRef } from "react";
import { ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";

import { imgUrl } from "@/lib/img-url";
import type { TripPhotoView } from "@/lib/photo-queries";
import { formatPhotoTime } from "@/lib/trip-view";
import { useScrollEdges } from "@/lib/use-scroll-edges";

export type PhotoDayRowProps = {
  label: string;
  photos: TripPhotoView[];
  noteCounts: Record<string, number>;
  onOpen: (photoId: string) => void;
};

function tileLabel(p: TripPhotoView, noteCount: number): string {
  const bits = [p.caption || "Photo", p.city, formatPhotoTime(p.takenAt)].filter(Boolean);
  if (noteCount > 0) bits.push(`${noteCount} ${noteCount === 1 ? "note" : "notes"}`);
  return bits.join(", ");
}

export function PhotoDayRow({ label, photos, noteCounts, onOpen }: PhotoDayRowProps) {
  const scroller = useRef<HTMLUListElement>(null);
  const { edges, page } = useScrollEdges(scroller, photos.length);

  const arrow =
    "absolute top-1/2 z-10 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow-md transition-opacity hover:bg-background [@media(hover:hover)]:flex";

  return (
    <div className="relative">
      <ul
        ref={scroller}
        aria-label={`Photos from ${label}`}
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:thin]"
      >
        {photos.map((p) => {
          const noteCount = noteCounts[p.id] ?? 0;
          const meta = [formatPhotoTime(p.takenAt), p.city].filter(Boolean).join(" · ");
          return (
            <li key={p.id} className="shrink-0 snap-start">
              <button
                type="button"
                onClick={() => onOpen(p.id)}
                aria-label={tileLabel(p, noteCount)}
                className="relative block size-40 cursor-pointer overflow-hidden rounded-sm bg-muted outline-none focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-primary sm:size-60"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgUrl(p.id, 400)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="size-full object-cover"
                />
                {noteCount > 0 && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white"
                  >
                    <MessageCircle className="size-3" />
                    {noteCount}
                  </span>
                )}
                {(meta || p.caption) && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-black/70 to-transparent px-2 pt-6 pb-1.5 text-left text-white"
                  >
                    {meta && <span className="truncate text-xs font-semibold">{meta}</span>}
                    {p.caption && <span className="line-clamp-2 text-xs/snug">{p.caption}</span>}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {/* Mouse convenience only: keyboard users tab through the tiles, touch swipes. */}
      {edges.start && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => page(-1)}
          className={`${arrow} left-2`}
        >
          <ChevronLeft className="size-6" />
        </button>
      )}
      {edges.end && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => page(1)}
          className={`${arrow} right-2`}
        >
          <ChevronRight className="size-6" />
        </button>
      )}
    </div>
  );
}

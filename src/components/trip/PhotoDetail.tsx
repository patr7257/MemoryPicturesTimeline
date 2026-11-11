"use client";

// Full-screen detail for one photo: the picture ("stage") and its information
// panel. Built on Dialog (focus trap, Escape, focus returns to what opened it).
// PhotoStage + PhotoInfoPanel are the pair; a later 3D flip can wrap exactly
// those two without touching navigation or the dialog shell.
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { PhotoInfoPanel } from "@/components/trip/PhotoInfoPanel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { CommentView } from "@/lib/comment-queries";
import { imgUrl } from "@/lib/img-url";
import type { TripPhotoView } from "@/lib/photo-queries";

export type PhotoDetailProps = {
  tripId: string;
  // In display order; prev/next walk this list.
  photos: TripPhotoView[];
  // Index into photos, or null when closed.
  index: number | null;
  onIndexChange: (index: number | null) => void;
  // Every comment of the vacation; the photo's own are picked out here.
  comments: CommentView[];
  onCommentAdded: (comment: CommentView) => void;
  onCommentDeleted: (commentId: string) => void;
  onCaptionChanged: (photoId: string, caption: string | null) => void;
  onPhotoDeleted: (photoId: string) => void;
};

const SWIPE_MIN = 60;

export function PhotoDetail({
  tripId,
  photos,
  index,
  onIndexChange,
  comments,
  onCommentAdded,
  onCommentDeleted,
  onCaptionChanged,
  onPhotoDeleted,
}: PhotoDetailProps) {
  const open = index !== null && index >= 0 && index < photos.length;
  const photo = open ? photos[index] : null;
  const [busy, setBusy] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const go = (delta: number) => {
    if (index === null) return;
    const next = index + delta;
    if (next >= 0 && next < photos.length) onIndexChange(next);
  };

  // Arrow keys while open, except when typing or while a confirmation is up.
  useEffect(() => {
    if (!open || busy) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (index === null) return;
      const next = index + (e.key === "ArrowRight" ? 1 : -1);
      if (next >= 0 && next < photos.length) onIndexChange(next);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, index, photos.length, onIndexChange]);

  // Warm the neighbours so stepping through feels instant.
  useEffect(() => {
    if (index === null) return;
    for (const i of [index - 1, index + 1]) {
      const p = photos[i];
      if (p) new Image().src = imgUrl(p.id, 1200);
    }
  }, [index, photos]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onIndexChange(null)}>
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 grid h-dvh w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[auto_auto] gap-0 overflow-y-auto overscroll-contain bg-background p-0 sm:max-w-none lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-1 lg:overflow-hidden"
      >
        {photo && index !== null && (
          <>
            <DialogTitle className="sr-only">
              Photo {index + 1} of {photos.length}
            </DialogTitle>

            <div
              className="relative flex h-[58dvh] min-h-64 items-center justify-center overflow-hidden bg-neutral-950 lg:h-dvh"
              onTouchStart={(e) => {
                const t = e.touches[0];
                touch.current = { x: t.clientX, y: t.clientY };
              }}
              onTouchEnd={(e) => {
                const start = touch.current;
                touch.current = null;
                if (!start) return;
                const t = e.changedTouches[0];
                const dx = t.clientX - start.x;
                const dy = t.clientY - start.y;
                if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) {
                  go(dx < 0 ? 1 : -1);
                }
              }}
            >
              {/* The proxy serves the 1200px WebP; no next/image by design. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={photo.id}
                src={imgUrl(photo.id, 1200)}
                alt={photo.caption ?? (photo.city ? `Photo from ${photo.city}` : "Photo")}
                draggable={false}
                className="max-h-full max-w-full object-contain select-none"
              />

              <DialogClose
                render={
                  <Button
                    variant="ghost"
                    className="absolute top-2 right-2 size-11 bg-black/50 text-white hover:bg-black/70 hover:text-white"
                  />
                }
              >
                <X className="size-5" />
                <span className="sr-only">Close photo</span>
              </DialogClose>

              <p className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
                {index + 1} / {photos.length}
              </p>

              {index > 0 && (
                <Button
                  variant="ghost"
                  className="absolute top-1/2 left-2 size-11 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70 hover:text-white"
                  onClick={() => go(-1)}
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="size-6" />
                </Button>
              )}
              {index < photos.length - 1 && (
                <Button
                  variant="ghost"
                  className="absolute top-1/2 right-2 size-11 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70 hover:text-white"
                  onClick={() => go(1)}
                  aria-label="Next photo"
                >
                  <ChevronRight className="size-6" />
                </Button>
              )}
            </div>

            <div className="p-4 pb-10 lg:h-dvh lg:overflow-y-auto">
              <PhotoInfoPanel
                key={photo.id}
                tripId={tripId}
                photo={photo}
                comments={comments.filter((c) => c.photoId === photo.id)}
                onCommentAdded={onCommentAdded}
                onCommentDeleted={onCommentDeleted}
                onCaptionChanged={onCaptionChanged}
                onPhotoDeleted={onPhotoDeleted}
                onBusyChange={setBusy}
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

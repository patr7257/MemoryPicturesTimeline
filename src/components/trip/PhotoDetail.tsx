"use client";

// Full-screen photo view shown as a postcard. Built on Dialog (focus trap,
// Escape, focus returns to what opened it). The card has two faces that turn
// in 3D around the vertical axis (CSS transforms only): the photo (front) and
// the handwritten back with caption, notes and stamp. Reduced motion gets a
// cross-fade instead. The face you are on is kept while browsing. Previous and
// next, swipe, download and delete live outside the card so they work on both
// faces and never fight it.
import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Download, RotateCw, Trash2, X } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { toast } from "sonner";

import { deletePhoto } from "@/actions/photos";
import { PostcardBack, type PostcardBackState } from "@/components/trip/PostcardBack";
import { PostcardFront } from "@/components/trip/PostcardFront";
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
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { CommentView } from "@/lib/comment-queries";
import { imgUrl } from "@/lib/img-url";
import type { TripPhotoView } from "@/lib/photo-queries";
import { nearestLocated, pickerStart } from "@/lib/photo-location";
import { flipFace, shortcutFor, type Face } from "@/lib/postcard";

export type PhotoDetailProps = {
  tripId: string;
  // Shown on the postcard's address lines when given.
  tripName?: string | null;
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
  onTakenAtChanged: (photoId: string, takenAt: Date | null) => void;
  onLocationChanged: (
    photoId: string,
    loc: { lat: number; lng: number; city: string | null; country: string | null; locationInferred: boolean },
  ) => void;
  // The vacation's pin: where the location picker opens when no photo nearby has one.
  tripPin?: { lat: number | null; lng: number | null } | null;
  onPhotoDeleted: (photoId: string) => void;
};

const SWIPE_MIN = 60;
const IDLE: PostcardBackState = { dirty: false, editing: false };
// Where to go once the "discard unsaved text?" question is answered.
type Pending = { to: number | null } | null;

export function PhotoDetail({
  tripId,
  tripName,
  photos,
  index,
  onIndexChange,
  comments,
  onCommentAdded,
  onCommentDeleted,
  onCaptionChanged,
  onTakenAtChanged,
  onLocationChanged,
  tripPin = null,
  onPhotoDeleted,
}: PhotoDetailProps) {
  const open = index !== null && index >= 0 && index < photos.length;
  const photo = open ? photos[index] : null;
  const reduced = useReducedMotion() ?? false;

  const [face, setFace] = useState<Face>("front");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setFace("front");
  }

  const [draft, setDraft] = useState<PostcardBackState>(IDLE);
  const [discard, setDiscard] = useState<Pending>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, startDelete] = useTransition();
  // Any open editor (the location map included) holds the arrow keys and F.
  const blocked = deleteOpen || discard !== null || draft.editing;

  const near = photo ? nearestLocated(photos, photo.id) : null;
  const nearbyLocation =
    near && near.lat !== null && near.lng !== null
      ? { lat: near.lat, lng: near.lng, label: near.city || "a nearby photo" }
      : null;

  const touch = useRef<{ x: number; y: number } | null>(null);
  const [popupEl, setPopupEl] = useState<HTMLDivElement | null>(null);
  const turnButton = useRef<HTMLButtonElement>(null);

  // Leaving the photo (or closing) asks first when text would be lost.
  const leave = (to: number | null) => {
    if (draft.dirty) setDiscard({ to });
    else onIndexChange(to);
  };

  const go = (delta: number) => {
    if (index === null) return;
    const next = index + delta;
    if (next >= 0 && next < photos.length) leave(next);
  };

  const flip = () => setFace((f) => flipFace(f));

  // F flips, arrows browse; never while typing or while a question is open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      const action = shortcutFor({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        typing,
        blocked,
      });
      if (!action) return;
      if (action === "flip") {
        e.preventDefault();
        setFace((f) => flipFace(f));
        return;
      }
      if (index === null) return;
      const next = index + (action === "next" ? 1 : -1);
      if (next < 0 || next >= photos.length) return;
      if (draft.dirty) setDiscard({ to: next });
      else onIndexChange(next);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, blocked, index, photos.length, draft.dirty, onIndexChange]);

  // After a turn, focus must not be stranded on the face that just went inert.
  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    if (!active || active === document.body || !popupEl?.contains(active)) {
      turnButton.current?.focus({ preventScroll: true });
    }
  }, [face, open, popupEl]);

  // The on-screen keyboard shrinks the visual viewport, not the layout one.
  // Track it so the card, the text box and Save stay above the keyboard.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = popupEl;
    if (!open || !vv || !el) return;
    function fit() {
      if (!el || !vv) return;
      el.style.height = `${vv.height}px`;
      el.style.top = `${vv.offsetTop}px`;
    }
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
    };
  }, [open, popupEl]);

  // Warm the neighbours so stepping through feels instant.
  useEffect(() => {
    if (index === null) return;
    for (const i of [index - 1, index + 1]) {
      const p = photos[i];
      if (p) new Image().src = imgUrl(p.id, 1200);
    }
  }, [index, photos]);

  function remove() {
    if (!photo) return;
    const id = photo.id;
    startDelete(async () => {
      try {
        await deletePhoto(id);
        toast.success("Photo deleted");
        setDeleteOpen(false);
        onPhotoDeleted(id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not delete the photo");
        setDeleteOpen(false);
      }
    });
  }

  const front = face === "front";
  const faceFade = reduced ? "opacity 250ms ease" : undefined;
  const iconBtn =
    "size-11 shrink-0 bg-white/10 text-white hover:bg-white/20 hover:text-white disabled:opacity-30";

  return (
    <Dialog
      open={open}
      onOpenChange={(o, details) => {
        if (o) return;
        // Escape ends an edit first; it never closes the dialog mid-edit.
        if (details.reason === "escape-key" && draft.editing) {
          details.cancel();
          return;
        }
        if (draft.dirty) {
          details.cancel();
          setDiscard({ to: null });
          return;
        }
        onIndexChange(null);
      }}
    >
      <DialogContent
        ref={setPopupEl}
        showCloseButton={false}
        className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden bg-neutral-950/85 p-0 ring-0 motion-reduce:animate-none sm:max-w-none"
      >
        {photo && index !== null && (
          <>
            <DialogTitle className="sr-only">
              Photo {index + 1} of {photos.length}
            </DialogTitle>

            <div className="flex shrink-0 items-center justify-between gap-2 px-2 pt-2 pb-1 sm:px-4">
              <p className="rounded-full bg-white/10 px-3 py-1 text-xs text-white">
                {index + 1} / {photos.length}
              </p>
              <DialogClose
                render={<Button variant="ghost" className={iconBtn} />}
                aria-label="Close photo"
              >
                <X className="size-5" />
              </DialogClose>
            </div>

            <div
              className="flex min-h-0 flex-1 items-center justify-center px-2 py-1 sm:px-6"
              onTouchStart={(e) => {
                const t = e.touches[0];
                const target = e.target as HTMLElement;
                touch.current = target.closest("textarea,input")
                  ? null
                  : { x: t.clientX, y: t.clientY };
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
              {/* Keyed so a new photo fades in; the perspective lives on the parent. */}
              <div
                key={photo.id}
                className="h-full max-h-full w-full max-w-4xl animate-in fade-in-0 duration-200 motion-reduce:animate-none md:aspect-[3/2] md:h-auto"
                style={{ perspective: "1800px" }}
              >
                <div
                  className="relative h-full w-full"
                  style={{
                    transformStyle: "preserve-3d",
                    transform: reduced ? undefined : `rotateY(${front ? 0 : 180}deg)`,
                    transition: reduced ? undefined : "transform 700ms cubic-bezier(0.2, 0.7, 0.2, 1)",
                  }}
                >
                  <div
                    inert={!front}
                    aria-hidden={!front}
                    className="absolute inset-0 overflow-hidden rounded-sm shadow-2xl"
                    style={{
                      backfaceVisibility: "hidden",
                      WebkitBackfaceVisibility: "hidden",
                      opacity: reduced ? (front ? 1 : 0) : undefined,
                      transition: faceFade,
                    }}
                  >
                    <PostcardFront photo={photo} onTurn={flip} />
                  </div>
                  <div
                    inert={front}
                    aria-hidden={front}
                    className="absolute inset-0 overflow-hidden rounded-sm bg-[oklch(0.965_0.03_85)] shadow-2xl"
                    style={{
                      backfaceVisibility: "hidden",
                      WebkitBackfaceVisibility: "hidden",
                      transform: reduced ? undefined : "rotateY(180deg)",
                      opacity: reduced ? (front ? 0 : 1) : undefined,
                      transition: faceFade,
                    }}
                  >
                    <PostcardBack
                      key={photo.id}
                      tripId={tripId}
                      tripName={tripName}
                      photo={photo}
                      comments={comments.filter((c) => c.photoId === photo.id)}
                      onCommentAdded={onCommentAdded}
                      onCommentDeleted={onCommentDeleted}
                      onCaptionChanged={onCaptionChanged}
                      onTakenAtChanged={onTakenAtChanged}
                      onLocationChanged={onLocationChanged}
                      nearbyLocation={nearbyLocation}
                      pickerStart={pickerStart(photo, nearbyLocation, tripPin)}
                      onStateChange={setDraft}
                      onTurn={flip}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-center gap-1.5 px-2 pt-1 pb-3 sm:gap-2">
              <Button
                variant="ghost"
                className={iconBtn}
                onClick={() => go(-1)}
                disabled={index === 0}
                aria-label="Previous photo"
              >
                <ChevronLeft className="size-6" />
              </Button>
              <Button
                ref={turnButton}
                className="min-h-11 px-4"
                onClick={flip}
                aria-keyshortcuts="F"
              >
                <RotateCw data-icon="inline-start" />
                {front ? "Turn over" : "Show photo"}
              </Button>
              <Button
                variant="ghost"
                className={iconBtn}
                nativeButton={false}
                render={<a href={imgUrl(photo.id, "orig")} download aria-label="Download original" />}
              >
                <Download className="size-5" />
              </Button>
              {photo.canManage && (
                <Button
                  variant="ghost"
                  className={`${iconBtn} text-red-200 hover:text-red-100`}
                  onClick={() => setDeleteOpen(true)}
                  aria-label="Delete photo"
                >
                  <Trash2 className="size-5" />
                </Button>
              )}
              <Button
                variant="ghost"
                className={iconBtn}
                onClick={() => go(1)}
                disabled={index === photos.length - 1}
                aria-label="Next photo"
              >
                <ChevronRight className="size-6" />
              </Button>
            </div>
          </>
        )}

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this photo?</AlertDialogTitle>
              <AlertDialogDescription>
                The photo and its notes are removed for everyone. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-11 sm:min-h-8" disabled={deleting}>
                Keep it
              </AlertDialogCancel>
              <Button
                variant="destructive"
                className="min-h-11 sm:min-h-8"
                onClick={remove}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete photo"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={discard !== null} onOpenChange={(o) => !o && setDiscard(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard what you wrote?</AlertDialogTitle>
              <AlertDialogDescription>
                You have text that is not saved yet. Leaving this photo throws it away.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-11 sm:min-h-8">Keep writing</AlertDialogCancel>
              <Button
                variant="destructive"
                className="min-h-11 sm:min-h-8"
                onClick={() => {
                  const to = discard?.to ?? null;
                  setDiscard(null);
                  setDraft(IDLE);
                  onIndexChange(to);
                }}
              >
                Discard
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

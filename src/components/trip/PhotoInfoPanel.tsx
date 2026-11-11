"use client";

// Everything about one photo except the picture itself: when, where, who,
// caption (editable by the uploader or a super admin), notes, download and
// delete. Pure of layout so it can sit beside the photo (desktop), below it
// (phone) or on the back of a flipped card later.
import { useState, useTransition } from "react";
import { CalendarDays, Download, MapPin, Pencil, Trash2, User } from "lucide-react";
import { toast } from "sonner";

import { deletePhoto, updatePhotoCaption } from "@/actions/photos";
import { CommentThread } from "@/components/comments/CommentThread";
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
import { Textarea } from "@/components/ui/textarea";
import type { CommentView } from "@/lib/comment-queries";
import { imgUrl } from "@/lib/img-url";
import type { TripPhotoView } from "@/lib/photo-queries";
import { CAPTION_MAX, formatPhotoDateTime } from "@/lib/trip-view";

export type PhotoInfoPanelProps = {
  tripId: string;
  photo: TripPhotoView;
  // Notes on this photo only, oldest first.
  comments: CommentView[];
  onCommentAdded: (comment: CommentView) => void;
  onCommentDeleted: (commentId: string) => void;
  // Called with the stored caption (null when cleared).
  onCaptionChanged: (photoId: string, caption: string | null) => void;
  onPhotoDeleted: (photoId: string) => void;
  // Called when a confirmation opens or closes, so a parent can pause
  // keyboard shortcuts while it is up.
  onBusyChange?: (busy: boolean) => void;
};

export function PhotoInfoPanel({
  tripId,
  photo,
  comments,
  onCommentAdded,
  onCommentDeleted,
  onCaptionChanged,
  onPhotoDeleted,
  onBusyChange,
}: PhotoInfoPanelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(photo.caption ?? "");
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const place = [photo.city, photo.country].filter(Boolean).join(", ");
  const when = formatPhotoDateTime(photo.takenAt);

  function saveCaption() {
    setCaptionError(null);
    startTransition(async () => {
      try {
        const stored = await updatePhotoCaption(photo.id, draft);
        onCaptionChanged(photo.id, stored);
        setEditing(false);
      } catch (err) {
        setCaptionError(err instanceof Error ? err.message : "Could not save the caption");
      }
    });
  }

  function remove() {
    startTransition(async () => {
      try {
        await deletePhoto(photo.id);
        toast.success("Photo deleted");
        setConfirmOpen(false);
        onBusyChange?.(false);
        onPhotoDeleted(photo.id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not delete the photo");
        setConfirmOpen(false);
        onBusyChange?.(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex items-start gap-2">
          <dt className="sr-only">Taken</dt>
          <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <dd>{when || <span className="text-muted-foreground">Date unknown</span>}</dd>
        </div>
        {place && (
          <div className="flex items-start gap-2">
            <dt className="sr-only">Place</dt>
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <dd>{place}</dd>
          </div>
        )}
        <div className="flex items-start gap-2">
          <dt className="sr-only">Added by</dt>
          <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <dd>Added by {photo.uploaderName}</dd>
        </div>
      </dl>

      <section aria-labelledby={`cap-${photo.id}`} className="flex flex-col gap-2">
        <h3 id={`cap-${photo.id}`} className="font-hand text-2xl leading-none">
          Caption
        </h3>
        {editing ? (
          <div className="flex flex-col gap-2">
            <label htmlFor={`cap-input-${photo.id}`} className="sr-only">
              Caption
            </label>
            <Textarea
              id={`cap-input-${photo.id}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={CAPTION_MAX}
              rows={3}
              disabled={pending}
              placeholder="What is going on here?"
              className="bg-card text-base md:text-sm"
              aria-invalid={captionError ? true : undefined}
            />
            {captionError && (
              <p role="alert" className="text-sm text-destructive">
                {captionError}
              </p>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {draft.length}/{CAPTION_MAX}
              </span>
              <span className="flex gap-2">
                <Button
                  variant="ghost"
                  className="min-h-11 px-4 sm:min-h-8"
                  onClick={() => {
                    setEditing(false);
                    setDraft(photo.caption ?? "");
                    setCaptionError(null);
                  }}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button className="min-h-11 px-4 sm:min-h-8" onClick={saveCaption} disabled={pending}>
                  {pending ? "Saving..." : "Save"}
                </Button>
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            {photo.caption ? (
              <p className="text-sm break-words whitespace-pre-wrap">{photo.caption}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No caption.</p>
            )}
            {photo.canManage && (
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 shrink-0 sm:min-h-7"
                onClick={() => {
                  setDraft(photo.caption ?? "");
                  setEditing(true);
                }}
              >
                <Pencil data-icon="inline-start" />
                {photo.caption ? "Edit" : "Add"}
              </Button>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby={`notes-${photo.id}`} className="flex flex-col gap-2">
        <h3 id={`notes-${photo.id}`} className="font-hand text-2xl leading-none">
          Notes
        </h3>
        <CommentThread
          tripId={tripId}
          photoId={photo.id}
          comments={comments}
          onAdded={onCommentAdded}
          onDeleted={onCommentDeleted}
          placeholder="Add a note about this photo..."
          emptyText="No notes on this photo yet."
          idPrefix="photo"
        />
      </section>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button
          variant="outline"
          className="min-h-11 sm:min-h-8"
          nativeButton={false}
          render={<a href={imgUrl(photo.id, "orig")} download aria-label="Download original" />}
        >
          <Download data-icon="inline-start" />
          Download original
        </Button>
        {photo.canManage && (
          <Button
            variant="destructive"
            className="min-h-11 sm:min-h-8"
            onClick={() => {
              setConfirmOpen(true);
              onBusyChange?.(true);
            }}
          >
            <Trash2 data-icon="inline-start" />
            Delete photo
          </Button>
        )}
      </div>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          onBusyChange?.(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this photo?</AlertDialogTitle>
            <AlertDialogDescription>
              The photo and its notes are removed for everyone. This cannot be undone.
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
              {pending ? "Deleting..." : "Delete photo"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

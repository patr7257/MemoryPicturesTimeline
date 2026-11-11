"use client";

// The back of the postcard: everything about one photo in handwriting. Left
// (or top-to-bottom on a phone): date, place, the caption as the message and
// the notes. Right: a stamp with a small copy of the photo, a postmark and the
// address lines. Reading is handwriting; editing swaps in PostcardEditor.
// The component stays mounted while the card is turned, so typed text
// survives an accidental flip. It reports unsaved text upward through
// onStateChange so the shell can ask before navigating away.
import { useEffect, useState, useTransition } from "react";
import { CalendarDays, MapPin, MessageSquarePlus, Pencil, RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { addComment, deleteComment } from "@/actions/comments";
import { updatePhotoCaption } from "@/actions/photos";
import { PostcardEditor } from "@/components/trip/PostcardEditor";
import { Button } from "@/components/ui/button";
import type { CommentView } from "@/lib/comment-queries";
import { imgUrl } from "@/lib/img-url";
import type { TripPhotoView } from "@/lib/photo-queries";
import { addressLines, hasUnsavedChanges, stampTilt } from "@/lib/postcard";
import {
  CAPTION_MAX,
  COMMENT_MAX,
  formatCommentTime,
  formatPhotoDateTime,
  formatPostmarkDate,
} from "@/lib/trip-view";

const PAPER_GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.07'/%3E%3C/svg%3E\")";

export type PostcardBackState = { dirty: boolean; editing: boolean };

export type PostcardBackProps = {
  tripId: string;
  tripName?: string | null;
  photo: TripPhotoView;
  // Notes on this photo only, oldest first.
  comments: CommentView[];
  onCommentAdded: (comment: CommentView) => void;
  onCommentDeleted: (commentId: string) => void;
  // Called with the stored caption (null when cleared).
  onCaptionChanged: (photoId: string, caption: string | null) => void;
  onStateChange: (state: PostcardBackState) => void;
  onTurn: () => void;
};

export function PostcardBack({
  tripId,
  tripName,
  photo,
  comments,
  onCommentAdded,
  onCommentDeleted,
  onCaptionChanged,
  onStateChange,
  onTurn,
}: PostcardBackProps) {
  const [captionEditing, setCaptionEditing] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(photo.caption ?? "");
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [captionPending, startCaption] = useTransition();

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [notePending, startNote] = useTransition();

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletePending, startDelete] = useTransition();

  const dirty = hasUnsavedChanges({
    caption: photo.caption,
    captionEditing,
    captionDraft,
    noteOpen,
    noteDraft,
  });
  const editing = captionEditing || noteOpen;
  useEffect(() => {
    onStateChange({ dirty, editing });
  }, [dirty, editing, onStateChange]);
  // A photo that goes away takes its unsaved state with it.
  useEffect(() => () => onStateChange({ dirty: false, editing: false }), [onStateChange]);

  const when = formatPhotoDateTime(photo.takenAt);
  const place = [photo.city, photo.country].filter(Boolean).join(", ");
  const postmark = formatPostmarkDate(photo.takenAt);
  const tilt = stampTilt(photo.id);
  const address = addressLines(photo.uploaderName, tripName);

  function startCaptionEdit() {
    if (!photo.canManage || captionEditing) return;
    setCaptionDraft(photo.caption ?? "");
    setCaptionError(null);
    setCaptionEditing(true);
  }

  function cancelCaption() {
    setCaptionEditing(false);
    setCaptionDraft(photo.caption ?? "");
    setCaptionError(null);
  }

  function saveCaption() {
    setCaptionError(null);
    startCaption(async () => {
      try {
        const stored = await updatePhotoCaption(photo.id, captionDraft);
        onCaptionChanged(photo.id, stored);
        setCaptionEditing(false);
      } catch (err) {
        setCaptionError(err instanceof Error ? err.message : "Could not save the caption");
      }
    });
  }

  function cancelNote() {
    setNoteOpen(false);
    setNoteDraft("");
    setNoteError(null);
  }

  function saveNote() {
    setNoteError(null);
    startNote(async () => {
      try {
        const created = await addComment({ tripId, photoId: photo.id, body: noteDraft });
        onCommentAdded(created);
        setNoteOpen(false);
        setNoteDraft("");
      } catch (err) {
        setNoteError(err instanceof Error ? err.message : "Could not save the note");
      }
    });
  }

  function removeNote(id: string) {
    startDelete(async () => {
      try {
        await deleteComment(id);
        onCommentDeleted(id);
        setConfirmId(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not delete the note");
      }
    });
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col-reverse text-neutral-800 md:flex-row"
      style={{ backgroundImage: PAPER_GRAIN }}
    >
      {/* Message side. Scrolls inside the card so nothing is ever clipped. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5 md:flex-[1.25]">
        <div className="flex flex-col gap-4">
          <dl className="flex flex-col gap-0.5 font-hand text-xl leading-tight text-neutral-700 sm:text-2xl">
            <div className="flex items-center gap-2">
              <dt className="sr-only">Taken</dt>
              <CalendarDays className="size-4 shrink-0 text-neutral-500" aria-hidden />
              <dd>{when || "Date unknown"}</dd>
            </div>
            {place && (
              <div className="flex items-center gap-2">
                <dt className="sr-only">Place</dt>
                <MapPin className="size-4 shrink-0 text-neutral-500" aria-hidden />
                <dd>{place}</dd>
              </div>
            )}
          </dl>

          <section aria-labelledby={`msg-${photo.id}`} className="flex flex-col gap-1">
            <h3 id={`msg-${photo.id}`} className="sr-only">
              Caption
            </h3>
            {captionEditing ? (
              <PostcardEditor
                id={`caption-${photo.id}`}
                label="Caption"
                value={captionDraft}
                onChange={setCaptionDraft}
                max={CAPTION_MAX}
                placeholder="What is going on here?"
                pending={captionPending}
                error={captionError}
                saveLabel="Save"
                onSave={saveCaption}
                onCancel={cancelCaption}
              />
            ) : (
              <div className="flex items-start gap-1">
                {/* The text is a mouse shortcut; the pencil is the accessible control. */}
                <div
                  className={`min-w-0 flex-1 ${photo.canManage ? "cursor-text" : ""}`}
                  onClick={startCaptionEdit}
                >
                  {photo.caption ? (
                    <p className="font-hand text-3xl leading-snug break-words whitespace-pre-wrap text-neutral-900 sm:text-[2rem]">
                      {photo.caption}
                    </p>
                  ) : photo.canManage ? (
                    <p className="font-hand text-3xl leading-snug text-neutral-500">
                      Write a few words about this photo
                    </p>
                  ) : null}
                </div>
                {photo.canManage && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="size-11 shrink-0 text-neutral-600 hover:bg-black/5"
                    onClick={startCaptionEdit}
                    aria-label={photo.caption ? "Edit caption" : "Add a caption"}
                  >
                    <Pencil />
                  </Button>
                )}
              </div>
            )}
          </section>

          <section aria-labelledby={`notes-${photo.id}`} className="flex flex-col gap-2">
            <h3
              id={`notes-${photo.id}`}
              className="font-hand text-2xl leading-none text-neutral-600"
            >
              Notes
            </h3>
            {comments.length > 0 && (
              <ul className="flex flex-col gap-3">
                {comments.map((c) => (
                  <li key={c.id} className="flex items-start gap-1 border-l-2 border-amber-700/30 pl-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-hand text-2xl leading-snug break-words whitespace-pre-wrap text-neutral-900">
                        {c.body}
                      </p>
                      <p className="font-sans text-xs text-neutral-600">
                        <span className="font-semibold">{c.authorName}</span>
                        {", "}
                        <time dateTime={c.createdAt.toISOString()}>
                          {formatCommentTime(c.createdAt)}
                        </time>
                      </p>
                    </div>
                    {c.canDelete &&
                      (confirmId === c.id ? (
                        <span className="flex shrink-0 items-center gap-1 font-sans">
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="min-h-11 px-3 sm:min-h-8"
                            onClick={() => removeNote(c.id)}
                            disabled={deletePending}
                          >
                            Delete
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="min-h-11 px-3 sm:min-h-8"
                            onClick={() => setConfirmId(null)}
                            disabled={deletePending}
                          >
                            Keep
                          </Button>
                        </span>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          className="size-11 shrink-0 text-neutral-500 hover:bg-black/5 sm:size-9"
                          onClick={() => setConfirmId(c.id)}
                          aria-label={`Delete note by ${c.authorName}`}
                        >
                          <Trash2 />
                        </Button>
                      ))}
                  </li>
                ))}
              </ul>
            )}
            {noteOpen ? (
              <PostcardEditor
                id={`note-${photo.id}`}
                label="Add a note"
                value={noteDraft}
                onChange={setNoteDraft}
                max={COMMENT_MAX}
                placeholder="Add a note about this photo..."
                pending={notePending}
                error={noteError}
                saveLabel="Save note"
                saveDisabled={noteDraft.trim().length === 0}
                onSave={saveNote}
                onCancel={cancelNote}
              />
            ) : (
              <div>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 px-3 font-sans text-neutral-700 hover:bg-black/5"
                  onClick={() => {
                    setNoteError(null);
                    setNoteOpen(true);
                  }}
                >
                  <MessageSquarePlus data-icon="inline-start" />
                  Add a note
                </Button>
              </div>
            )}
          </section>

          <div>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 px-3 font-sans text-neutral-600 hover:bg-black/5"
              onClick={onTurn}
            >
              <RotateCw data-icon="inline-start" />
              Back to the photo
            </Button>
          </div>
        </div>
      </div>

      {/* Divider: vertical on wide cards, horizontal when stacked. */}
      <div
        aria-hidden
        className="border-t-2 border-dashed border-neutral-400/50 md:border-t-0 md:border-l-2"
      />

      {/* Stamp, postmark, address. On a phone this sits on top as one row. */}
      <div className="flex shrink-0 items-start gap-4 px-4 py-3 sm:px-6 md:flex-1 md:flex-col md:items-stretch md:gap-6 md:overflow-y-auto md:py-5">
        <div className="relative shrink-0 md:self-end md:pr-2">
          <div
            className="w-20 border-2 border-dashed border-amber-800/50 bg-white p-1.5 shadow-sm sm:w-24 md:w-32"
            style={{ transform: `rotate(${tilt}deg)` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgUrl(photo.id, 400)}
              alt=""
              draggable={false}
              className="aspect-square w-full object-cover sepia-[0.25]"
            />
          </div>
          {postmark && (
            <svg
              aria-hidden
              viewBox="0 0 96 96"
              className="pointer-events-none absolute -right-3 -bottom-4 size-16 text-neutral-700/60 md:right-auto md:-bottom-5 md:-left-10 md:size-24"
              style={{ transform: `rotate(${-tilt * 2 - 8}deg)` }}
            >
              <circle cx="48" cy="48" r="44" fill="none" stroke="currentColor" strokeWidth="2.5" />
              <circle cx="48" cy="48" r="37" fill="none" stroke="currentColor" strokeWidth="1" />
              <text
                x="48"
                y="46"
                textAnchor="middle"
                fontSize="13"
                fontWeight="700"
                fill="currentColor"
                fontFamily="sans-serif"
              >
                {postmark.top}
              </text>
              <text
                x="48"
                y="62"
                textAnchor="middle"
                fontSize="12"
                fill="currentColor"
                fontFamily="sans-serif"
              >
                {postmark.bottom}
              </text>
            </svg>
          )}
        </div>

        <div className="min-w-0 flex-1 pt-1 md:flex-none">
          <ul className="flex flex-col font-hand text-xl text-neutral-800 sm:text-2xl">
            {address.map((line) => (
              <li
                key={line}
                className="border-b border-dashed border-neutral-400/70 pb-0.5 break-words md:pt-2"
              >
                {line}
              </li>
            ))}
            <li aria-hidden className="h-7 border-b border-dashed border-neutral-400/70 md:h-9" />
          </ul>
        </div>
      </div>
    </div>
  );
}

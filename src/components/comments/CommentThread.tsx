"use client";

// Notes on one thing: a vacation (photoId omitted) or one photo. Controlled:
// the owner holds the list and hears about changes through onAdded/onDeleted,
// so the same thread works inside the photo detail and in the Notes section.
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { addComment, deleteComment } from "@/actions/comments";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CommentView } from "@/lib/comment-queries";
import { COMMENT_MAX, formatCommentTime } from "@/lib/trip-view";

export type CommentThreadProps = {
  tripId: string;
  // Omit for notes on the vacation itself.
  photoId?: string | null;
  // Only the comments of this thread, oldest first.
  comments: CommentView[];
  onAdded: (comment: CommentView) => void;
  onDeleted: (commentId: string) => void;
  placeholder?: string;
  emptyText?: string;
  // Prefix for element ids when several threads can be on screen.
  idPrefix?: string;
};

export function CommentThread({
  tripId,
  photoId = null,
  comments,
  onAdded,
  onDeleted,
  placeholder = "Write a note...",
  emptyText = "No notes yet.",
  idPrefix = "thread",
}: CommentThreadProps) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const inputId = `${idPrefix}-${photoId ?? tripId}-input`;

  function submit() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const created = await addComment({ tripId, photoId, body });
        onAdded(created);
        setBody("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the note");
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      try {
        await deleteComment(id);
        onDeleted(id);
        setConfirmId(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not delete the note");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {comments.map((c) => (
            <li key={c.id} className="rounded-md bg-muted/60 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{c.authorName}</span>
                  {" · "}
                  <time dateTime={c.createdAt.toISOString()}>{formatCommentTime(c.createdAt)}</time>
                </p>
                {c.canDelete &&
                  (confirmId === c.id ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="min-h-11 px-3 sm:min-h-7"
                        onClick={() => remove(c.id)}
                        disabled={pending}
                      >
                        Delete
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-11 px-3 sm:min-h-7"
                        onClick={() => setConfirmId(null)}
                        disabled={pending}
                      >
                        Keep
                      </Button>
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="-mt-1 -mr-1.5 size-11 shrink-0 text-muted-foreground sm:size-7"
                      onClick={() => setConfirmId(c.id)}
                      aria-label={`Delete note by ${c.authorName}`}
                    >
                      <Trash2 />
                    </Button>
                  ))}
              </div>
              <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Add a note
        </label>
        <Textarea
          id={inputId}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          rows={2}
          maxLength={COMMENT_MAX}
          disabled={pending}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="min-h-20 bg-card text-base md:text-sm"
        />
        {error && (
          <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground" aria-hidden={body.length < COMMENT_MAX - 200}>
            {body.length >= COMMENT_MAX - 200 ? `${body.length}/${COMMENT_MAX}` : ""}
          </span>
          <Button
            type="submit"
            className="min-h-11 px-4 sm:min-h-8"
            disabled={pending || body.trim().length === 0}
          >
            {pending ? "Saving..." : "Add note"}
          </Button>
        </div>
      </form>
    </div>
  );
}

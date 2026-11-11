"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { comments } from "@/db/schema";
import { findVisiblePhoto, findVisibleTrip, getViewer } from "@/lib/access";
import { AccessError, canDeleteComment } from "@/lib/access-policy";
import type { CommentView } from "@/lib/comment-queries";
import { validateCommentBody } from "@/lib/trip-view";

export type AddCommentInput = {
  tripId: string;
  // Omit (or null) for a note on the vacation itself.
  photoId?: string | null;
  body: string;
};

export async function addComment(input: AddCommentInput): Promise<CommentView> {
  const viewer = await getViewer();
  const trip = await findVisibleTrip(viewer, input.tripId);
  if (!trip) throw new AccessError("Vacation not found");

  let photoId: string | null = null;
  if (input.photoId) {
    const found = await findVisiblePhoto(viewer, input.photoId);
    if (!found || found.photo.tripId !== trip.id) throw new AccessError("Photo not found");
    photoId = found.photo.id;
  }

  const checked = validateCommentBody(input.body);
  if (!checked.ok) throw new Error(checked.error);

  const [row] = await getDb()
    .insert(comments)
    .values({ tripId: trip.id, photoId, authorId: viewer.userId, body: checked.value })
    .returning();

  revalidatePath("/", "layout");
  return {
    id: row.id,
    tripId: row.tripId,
    photoId: row.photoId,
    authorId: row.authorId,
    authorName: viewer.name,
    body: row.body,
    createdAt: row.createdAt,
    canDelete: true,
  };
}

export async function deleteComment(commentId: string): Promise<void> {
  const viewer = await getViewer();
  const db = getDb();
  const comment = await db.query.comments.findFirst({ where: eq(comments.id, commentId) });
  // A comment on a vacation the viewer cannot see reads as missing.
  if (!comment || !(await findVisibleTrip(viewer, comment.tripId))) {
    throw new AccessError("Note not found");
  }
  if (!canDeleteComment(viewer, comment)) {
    throw new AccessError("Only the author or a super admin can delete this note");
  }
  await db.delete(comments).where(eq(comments.id, commentId));
  revalidatePath("/", "layout");
}

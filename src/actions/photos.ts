"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { photos, trips } from "@/db/schema";
import { findVisiblePhoto, getViewer } from "@/lib/access";
import { AccessError, canManagePhoto } from "@/lib/access-policy";
import { deleteObjects, r2Configured } from "@/lib/r2";
import { validateCaption } from "@/lib/trip-view";

async function requireManagedPhoto(photoId: string) {
  const viewer = await getViewer();
  const found = await findVisiblePhoto(viewer, photoId);
  if (!found) throw new AccessError("Photo not found");
  if (!canManagePhoto(viewer, found.photo)) {
    throw new AccessError("Only the uploader or a super admin can change this photo");
  }
  return found;
}

export async function deletePhoto(photoId: string): Promise<void> {
  const { photo, trip } = await requireManagedPhoto(photoId);
  const db = getDb();

  // Row first (its comments cascade), clearing the cover if it was this photo.
  await db.delete(photos).where(eq(photos.id, photo.id));
  await db
    .update(trips)
    .set({ coverPhotoId: null })
    .where(and(eq(trips.id, trip.id), eq(trips.coverPhotoId, photo.id)));

  // Storage is best effort: an orphaned object is cheap, a failed action that
  // already removed the row is not. Log the photo id only.
  if (r2Configured()) {
    try {
      await deleteObjects([photo.r2KeyOriginal, photo.r2Key400, photo.r2Key1200]);
    } catch (err) {
      console.error(
        "[photos] storage delete failed for photo",
        photo.id,
        err instanceof Error ? err.name : "error",
      );
    }
  } else {
    console.error("[photos] storage not configured, objects left for photo", photo.id);
  }

  revalidatePath("/", "layout");
}

// Returns the stored caption (trimmed, null when cleared).
export async function updatePhotoCaption(
  photoId: string,
  caption: string,
): Promise<string | null> {
  const { photo } = await requireManagedPhoto(photoId);
  const checked = validateCaption(caption);
  if (!checked.ok) throw new Error(checked.error);
  await getDb().update(photos).set({ caption: checked.value }).where(eq(photos.id, photo.id));
  revalidatePath("/", "layout");
  return checked.value;
}

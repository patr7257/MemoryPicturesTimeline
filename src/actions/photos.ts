"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { photos, trips } from "@/db/schema";
import { findVisiblePhoto, getViewer } from "@/lib/access";
import { AccessError, canManagePhoto } from "@/lib/access-policy";
import { reverseGeocode } from "@/lib/geocode";
import { validateLatLng } from "@/lib/photo-location";
import { deleteObjects, r2Configured } from "@/lib/r2";
import { parseTakenAt, validateCaption } from "@/lib/trip-view";

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

// Sets where the photo was taken, picked on a map. City and country are looked
// up again for the new spot (best effort: null when the lookup fails).
export async function updatePhotoLocation(
  photoId: string,
  lat: number,
  lng: number,
): Promise<{ lat: number; lng: number; city: string | null; country: string | null; locationInferred: false }> {
  const { photo } = await requireManagedPhoto(photoId);
  const checked = validateLatLng(lat, lng);
  if (!checked.ok) throw new Error(checked.error);
  const geo = await reverseGeocode(checked.value.lat, checked.value.lng);
  // A spot set by hand is exact: it is no longer an inferred one.
  const stored = { ...checked.value, city: geo.city, country: geo.country, locationInferred: false as const };
  await getDb().update(photos).set(stored).where(eq(photos.id, photo.id));
  revalidatePath("/", "layout");
  return stored;
}

// Sets when the photo was taken: date "yyyy-mm-dd" and optional time "hh:mm"
// as the wall clock (see parseTakenAt). An empty date clears it. Returns the
// stored value so the page can move the photo to its new day at once.
export async function updatePhotoTakenAt(
  photoId: string,
  date: string,
  time: string,
): Promise<Date | null> {
  const { photo } = await requireManagedPhoto(photoId);
  const checked = parseTakenAt(date, time);
  if (!checked.ok) throw new Error(checked.error);
  await getDb().update(photos).set({ takenAt: checked.value }).where(eq(photos.id, photo.id));
  revalidatePath("/", "layout");
  return checked.value;
}

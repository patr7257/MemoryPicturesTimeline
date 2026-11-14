// Server-only reads for the vacation pages. Everything goes through the
// access layer: the trip is loaded with getTripWithPhotos (null when missing or
// not visible), so nothing here can leak a trip the viewer may not see.
import "server-only";

import { cache } from "react";
import { inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { user } from "@/db/auth-schema";
import { getViewer } from "@/lib/access";
import { canManagePhoto } from "@/lib/access-policy";
import { getTripComments } from "@/lib/comment-queries";
import { getTripWithPhotos } from "@/lib/queries";
import { tripPin } from "@/lib/trip-pin";

export async function getUploaderNames(userIds: string[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set(userIds));
  if (ids.length === 0) return {};
  const rows = await getDb()
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, ids));
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

// What the browser needs about one photo. No storage keys.
export type TripPhotoView = {
  id: string;
  width: number;
  height: number;
  blurhash: string | null;
  takenAt: Date | null;
  city: string | null;
  country: string | null;
  // Where it was taken; null when unknown (the viewer can see the photo anyway).
  lat: number | null;
  lng: number | null;
  // The location was copied from a photo taken the same day (approximate).
  locationInferred: boolean;
  caption: string | null;
  uploaderId: string;
  uploaderName: string;
  // The viewer may caption and delete it (uploader or super admin).
  canManage: boolean;
};

// Loaded once per request: the vacation layout and its pages call it with the
// same id and share one result (React cache), so the header and the tabs never
// fetch twice. Null when the vacation does not exist or is not visible.
export const getTripPageData = cache(async (tripId: string) => {
  const viewer = await getViewer();
  return getTripWithPhotos(viewer, tripId);
});

export const getTripOverviewData = cache(async (tripId: string) => {
  const viewer = await getViewer();
  const data = await getTripPageData(tripId);
  if (!data) return null;
  const [comments, names] = await Promise.all([
    getTripComments(viewer, tripId),
    getUploaderNames(data.photos.map((p) => p.uploaderId)),
  ]);
  const photos: TripPhotoView[] = data.photos.map((p) => ({
    id: p.id,
    width: p.width,
    height: p.height,
    blurhash: p.blurhash,
    takenAt: p.takenAt,
    city: p.city,
    country: p.country,
    lat: p.lat,
    locationInferred: p.locationInferred,
    lng: p.lng,
    caption: p.caption,
    uploaderId: p.uploaderId,
    uploaderName: names[p.uploaderId] ?? "Someone",
    canManage: canManagePhoto(viewer, p),
  }));
  return { trip: data.trip, photos, comments, pin: tripPin(data.trip, data.photos) };
});

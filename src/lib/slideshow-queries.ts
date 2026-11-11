// Server-only reads for the slideshow. Every read goes through the access
// helpers, so a viewer only ever gets photos of vacations they may see.
import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { photos, tripPeople, trips } from "@/db/schema";
import { findVisibleTrip, visibleTripIds } from "@/lib/access";
import type { Viewer } from "@/lib/access-policy";
import { getCommentsForTrips } from "@/lib/comment-queries";
import { sortByTime, type SlideshowComment, type SlideshowPhoto } from "@/lib/slideshow";

export type SlideshowScope = { tripId: string } | { personId?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TripInfo = { id: string; title: string; startDate: string };

async function loadPhotos(viewer: Viewer, tripRows: TripInfo[]): Promise<SlideshowPhoto[]> {
  if (tripRows.length === 0) return [];
  const ids = tripRows.map((t) => t.id);
  const byTrip = new Map(tripRows.map((t) => [t.id, t]));

  const [photoRows, commentRows] = await Promise.all([
    getDb()
      .select({
        id: photos.id,
        tripId: photos.tripId,
        width: photos.width,
        height: photos.height,
        takenAt: photos.takenAt,
        city: photos.city,
        country: photos.country,
        caption: photos.caption,
      })
      .from(photos)
      .where(inArray(photos.tripId, ids)),
    getCommentsForTrips(viewer, ids),
  ]);

  // Comments arrive oldest first; keep that order per photo.
  const commentsByPhoto = new Map<string, SlideshowComment[]>();
  for (const c of commentRows) {
    if (!c.photoId) continue;
    const list = commentsByPhoto.get(c.photoId) ?? [];
    list.push({ authorName: c.authorName, body: c.body });
    commentsByPhoto.set(c.photoId, list);
  }

  return sortByTime(
    photoRows.map((p) => {
      const trip = byTrip.get(p.tripId)!;
      return {
        id: p.id,
        width: p.width,
        height: p.height,
        takenAt: p.takenAt ? p.takenAt.toISOString() : null,
        city: p.city,
        country: p.country,
        caption: p.caption,
        tripId: p.tripId,
        tripTitle: trip.title,
        tripStartDate: trip.startDate,
        comments: commentsByPhoto.get(p.id) ?? [],
      };
    }),
  );
}

// { tripId }: that vacation's photos, or null when it is missing or the
// viewer may not see it (callers answer notFound()).
// { personId }: photos of every vacation the viewer may see that the person is
// tagged on. No personId: every vacation the viewer may see.
// Time order: vacations by start date, then photos by takenAt, undated last.
export async function getSlideshowPhotos(
  viewer: Viewer,
  scope: SlideshowScope,
): Promise<SlideshowPhoto[] | null> {
  if ("tripId" in scope) {
    if (!UUID.test(scope.tripId)) return null;
    const trip = await findVisibleTrip(viewer, scope.tripId);
    if (!trip) return null;
    return loadPhotos(viewer, [{ id: trip.id, title: trip.title, startDate: trip.startDate }]);
  }

  const db = getDb();
  const visible = await visibleTripIds(viewer);
  if (visible !== "all" && visible.size === 0) return [];

  const conditions = [];
  if (scope.personId) {
    if (!UUID.test(scope.personId)) return [];
    const tagged = await db
      .select({ id: tripPeople.tripId })
      .from(tripPeople)
      .where(eq(tripPeople.personId, scope.personId));
    const ids = tagged.map((t) => t.id).filter((id) => visible === "all" || visible.has(id));
    if (ids.length === 0) return [];
    conditions.push(inArray(trips.id, ids));
  } else if (visible !== "all") {
    conditions.push(inArray(trips.id, Array.from(visible)));
  }

  const tripRows = await db
    .select({ id: trips.id, title: trips.title, startDate: trips.startDate })
    .from(trips)
    .where(conditions.length ? and(...conditions) : undefined);
  return loadPhotos(viewer, tripRows);
}

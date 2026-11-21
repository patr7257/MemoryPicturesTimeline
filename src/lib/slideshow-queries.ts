// Server-only reads for the slideshow. Every read goes through the access
// helpers, so a viewer only ever gets photos of vacations they may see.
import "server-only";

import { and, inArray, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { photos, tripPeople, trips } from "@/db/schema";
import { findVisibleTrip, visibleTripIds } from "@/lib/access";
import type { Viewer } from "@/lib/access-policy";
import { getCommentsForTrips } from "@/lib/comment-queries";
import {
  sortByTime,
  type SlideshowComment,
  type SlideshowPhoto,
  type SlideshowVacation,
  type VacationPhoto,
} from "@/lib/slideshow";

export type SlideshowScope = { tripId: string } | { personIds?: string[] };

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
// { personIds }: photos of every vacation the viewer may see on which ANY of the
// people is tagged. Missing or empty personIds: every vacation the viewer may
// see. A non-empty list with no well-formed id matches nothing (never everything).
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

  const where = await visibleTripsWhere(viewer, scope.personIds);
  if (where === null) return [];
  const tripRows = await getDb()
    .select({ id: trips.id, title: trips.title, startDate: trips.startDate })
    .from(trips)
    .where(where);
  return loadPhotos(viewer, tripRows);
}

// The trips filter both slideshow kinds share: every vacation the viewer may
// see, narrowed to those on which ANY of the people is tagged. null means
// nothing matches; undefined means no filter (a super admin, no people).
async function visibleTripsWhere(
  viewer: Viewer,
  requested: string[] = [],
): Promise<SQL | undefined | null> {
  const visible = await visibleTripIds(viewer);
  if (visible !== "all" && visible.size === 0) return null;

  const conditions = [];
  if (requested.length > 0) {
    const personIds = requested.filter((id) => UUID.test(id));
    if (personIds.length === 0) return null;
    const tagged = await getDb()
      .select({ id: tripPeople.tripId })
      .from(tripPeople)
      .where(inArray(tripPeople.personId, personIds));
    const ids = Array.from(new Set(tagged.map((t) => t.id))).filter(
      (id) => visible === "all" || visible.has(id),
    );
    if (ids.length === 0) return null;
    conditions.push(inArray(trips.id, ids));
  } else if (visible !== "all") {
    conditions.push(inArray(trips.id, Array.from(visible)));
  }
  return conditions.length ? and(...conditions) : undefined;
}

// Every vacation the viewer may see (narrowed by personIds exactly like
// getSlideshowPhotos), with its photos in time order. Vacations without photos
// are included; the screen builder drops them.
export async function getSlideshowVacations(
  viewer: Viewer,
  personIds?: string[],
): Promise<SlideshowVacation[]> {
  const where = await visibleTripsWhere(viewer, personIds);
  if (where === null) return [];
  const db = getDb();
  const tripRows = await db
    .select({
      id: trips.id,
      title: trips.title,
      startDate: trips.startDate,
      endDate: trips.endDate,
      locationName: trips.locationName,
      description: trips.description,
      coverPhotoId: trips.coverPhotoId,
    })
    .from(trips)
    .where(where);
  if (tripRows.length === 0) return [];

  const photoRows = await db
    .select({ id: photos.id, tripId: photos.tripId, takenAt: photos.takenAt, caption: photos.caption })
    .from(photos)
    .where(
      inArray(
        photos.tripId,
        tripRows.map((t) => t.id),
      ),
    );

  // Same photo order as the photo slideshow: by takenAt, undated last.
  const sorted = sortByTime(
    photoRows.map((p) => ({
      id: p.id,
      caption: p.caption,
      tripId: p.tripId,
      tripStartDate: "",
      takenAt: p.takenAt ? p.takenAt.toISOString() : null,
    })),
  );
  const byTrip = new Map<string, VacationPhoto[]>();
  for (const p of sorted) {
    const list = byTrip.get(p.tripId) ?? [];
    list.push({ id: p.id, caption: p.caption });
    byTrip.set(p.tripId, list);
  }

  return tripRows
    .map((t) => ({
      id: t.id,
      title: t.title,
      startDate: t.startDate,
      endDate: t.endDate,
      locationName: t.locationName,
      note: t.description,
      coverPhotoId: t.coverPhotoId,
      photos: byTrip.get(t.id) ?? [],
    }))
    .sort((a, b) =>
      a.startDate !== b.startDate ? (a.startDate < b.startDate ? -1 : 1) : a.id < b.id ? -1 : 1,
    );
}

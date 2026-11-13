// Read-side queries for the timeline. At family scale (dozens of trips,
// hundreds of photos) fetching everything and grouping in JS is the boring,
// correct choice: one round trip per table, no clever SQL.
//
// Every read takes the Viewer and returns only what that viewer may see
// (src/lib/access-policy.ts). There is no unfiltered variant on purpose.
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";

import { getDb } from "@/db";
import { people, photos, tripPeople, trips } from "@/db/schema";
import { findVisibleTrip, visibleTripIds } from "@/lib/access";
import { canManageTrip, type Viewer } from "@/lib/access-policy";
import { matchesPeople } from "@/lib/person-filter";
import type { MapPhoto } from "@/lib/photo-clusters";
import { tripPin } from "@/lib/trip-pin";

export type PersonRef = { id: string; name: string };

export type PhotoPreview = {
  id: string;
  width: number;
  height: number;
  blurhash: string | null;
  takenAt: Date | null;
  city: string | null;
  caption: string | null;
};

export type TimelineTrip = {
  id: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  people: PersonRef[];
  photoCount: number;
  previewPhotos: PhotoPreview[];
  coverPhotoId: string | null;
  createdBy: string | null;
  // The viewer may edit details, change tags and delete this trip.
  canManage: boolean;
};

export type TimelineYear = { year: number; trips: TimelineTrip[] };

const PREVIEW_COUNT = 5;

export async function getTimelineData(
  viewer: Viewer,
  personIds?: readonly string[],
): Promise<{
  years: TimelineYear[];
  allPeople: PersonRef[];
  totalTrips: number;
}> {
  const db = getDb();

  const [visible, everyTrip, allTripPeople, allPeople, everyPhoto] = await Promise.all([
    visibleTripIds(viewer),
    db.select().from(trips).orderBy(desc(trips.startDate)),
    db.select().from(tripPeople),
    db.select({ id: people.id, name: people.name }).from(people).orderBy(asc(people.name)),
    db
      .select({
        id: photos.id,
        tripId: photos.tripId,
        width: photos.width,
        height: photos.height,
        blurhash: photos.blurhash,
        takenAt: photos.takenAt,
        city: photos.city,
        caption: photos.caption,
        lat: photos.lat,
        lng: photos.lng,
      })
      .from(photos)
      .orderBy(asc(photos.takenAt)),
  ]);
  const allTrips = visible === "all" ? everyTrip : everyTrip.filter((t) => visible.has(t.id));
  const tripIds = new Set(allTrips.map((t) => t.id));
  const allPhotos = everyPhoto.filter((p) => tripIds.has(p.tripId));

  const peopleByTrip = new Map<string, PersonRef[]>();
  const personById = new Map(allPeople.map((p) => [p.id, p]));
  for (const tp of allTripPeople) {
    const person = personById.get(tp.personId);
    if (!person) continue;
    const list = peopleByTrip.get(tp.tripId) ?? [];
    list.push(person);
    peopleByTrip.set(tp.tripId, list);
  }

  const photosByTrip = new Map<string, (typeof allPhotos)[number][]>();
  for (const p of allPhotos) {
    const list = photosByTrip.get(p.tripId) ?? [];
    list.push(p);
    photosByTrip.set(p.tripId, list);
  }

  // Any selected person tagged on the trip matches; empty or undefined = everyone.
  const filtered = allTrips.filter((t) =>
    matchesPeople(
      personIds ?? [],
      (peopleByTrip.get(t.id) ?? []).map((p) => p.id),
    ),
  );

  const yearsMap = new Map<number, TimelineTrip[]>();
  for (const t of filtered) {
    const year = Number(t.startDate.slice(0, 4));
    const tripPhotos = photosByTrip.get(t.id) ?? [];
    // The pin follows the cover photo (src/lib/trip-pin.ts).
    const pin = tripPin(t, tripPhotos);
    const entry: TimelineTrip = {
      id: t.id,
      title: t.title,
      description: t.description,
      startDate: t.startDate,
      endDate: t.endDate,
      locationName: t.locationName,
      lat: pin.lat,
      lng: pin.lng,
      people: peopleByTrip.get(t.id) ?? [],
      photoCount: tripPhotos.length,
      // Photo coordinates stay on the server; previews carry no location.
      previewPhotos: tripPhotos.slice(0, PREVIEW_COUNT).map(({ tripId: _t, lat: _a, lng: _o, ...p }) => p),
      coverPhotoId: t.coverPhotoId ?? tripPhotos[0]?.id ?? null,
      createdBy: t.createdBy,
      canManage: canManageTrip(viewer, t),
    };
    const list = yearsMap.get(year) ?? [];
    list.push(entry);
    yearsMap.set(year, list);
  }

  const years = Array.from(yearsMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, list]) => ({ year, trips: list }));

  return { years, allPeople, totalTrips: filtered.length };
}

// Null when the trip does not exist OR the viewer may not see it.
export async function getTripWithPhotos(viewer: Viewer, tripId: string) {
  const db = getDb();
  const trip = await findVisibleTrip(viewer, tripId);
  if (!trip) return null;

  const [tripPhotos, links] = await Promise.all([
    db.select().from(photos).where(eq(photos.tripId, tripId)).orderBy(asc(photos.takenAt), asc(photos.createdAt)),
    db.select().from(tripPeople).where(eq(tripPeople.tripId, tripId)),
  ]);
  const personIds = links.map((l) => l.personId);
  const tripPersons = personIds.length
    ? await db
        .select({ id: people.id, name: people.name })
        .from(people)
        .where(inArray(people.id, personIds))
    : [];

  return { trip, photos: tripPhotos, people: tripPersons, canManage: canManageTrip(viewer, trip) };
}

export type TripOption = { id: string; title: string; startDate: string };

// Trips the viewer may upload to (every trip they can see), newest first.
export async function getVisibleTripOptions(viewer: Viewer): Promise<TripOption[]> {
  const [visible, rows] = await Promise.all([
    visibleTripIds(viewer),
    getDb()
      .select({ id: trips.id, title: trips.title, startDate: trips.startDate })
      .from(trips)
      .orderBy(desc(trips.startDate)),
  ]);
  return visible === "all" ? rows : rows.filter((t) => visible.has(t.id));
}

// Every photo with a GPS location in the vacations the viewer may see, for the
// map tab. With people picked, only vacations with any of them (as on the
// timeline). Oldest first.
export async function getMapPhotos(
  viewer: Viewer,
  personIds: readonly string[] = [],
): Promise<MapPhoto[]> {
  const db = getDb();
  const [visible, everyTrip, allTripPeople, located] = await Promise.all([
    visibleTripIds(viewer),
    db.select({ id: trips.id, title: trips.title }).from(trips),
    db.select().from(tripPeople),
    db
      .select({
        id: photos.id,
        tripId: photos.tripId,
        lat: photos.lat,
        lng: photos.lng,
        takenAt: photos.takenAt,
        city: photos.city,
      })
      .from(photos)
      .where(and(isNotNull(photos.lat), isNotNull(photos.lng)))
      .orderBy(asc(photos.takenAt)),
  ]);

  const peopleByTrip = new Map<string, string[]>();
  for (const tp of allTripPeople) {
    const list = peopleByTrip.get(tp.tripId) ?? [];
    list.push(tp.personId);
    peopleByTrip.set(tp.tripId, list);
  }
  const titles = new Map(
    everyTrip
      .filter((t) => visible === "all" || visible.has(t.id))
      .filter((t) => matchesPeople(personIds, peopleByTrip.get(t.id) ?? []))
      .map((t) => [t.id, t.title]),
  );

  const out: MapPhoto[] = [];
  for (const p of located) {
    const tripTitle = titles.get(p.tripId);
    if (tripTitle === undefined || p.lat === null || p.lng === null) continue;
    out.push({ ...p, lat: p.lat, lng: p.lng, tripTitle });
  }
  return out;
}

export async function getAllPeople(): Promise<PersonRef[]> {
  return getDb()
    .select({ id: people.id, name: people.name })
    .from(people)
    .orderBy(asc(people.name));
}

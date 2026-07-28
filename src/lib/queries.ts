// Read-side queries for the timeline. At family scale (dozens of trips,
// hundreds of photos) fetching everything and grouping in JS is the boring,
// correct choice: one round trip per table, no clever SQL.
import { asc, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { people, photos, tripPeople, trips } from "@/db/schema";

export type PersonRef = { id: string; name: string };

export type PhotoPreview = {
  id: string;
  width: number;
  height: number;
  blurhash: string | null;
  takenAt: Date | null;
  city: string | null;
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
};

export type TimelineYear = { year: number; trips: TimelineTrip[] };

const PREVIEW_COUNT = 5;

export async function getTimelineData(personId?: string): Promise<{
  years: TimelineYear[];
  allPeople: PersonRef[];
  totalTrips: number;
}> {
  const db = getDb();

  const [allTrips, allTripPeople, allPeople, allPhotos] = await Promise.all([
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
      })
      .from(photos)
      .orderBy(asc(photos.takenAt)),
  ]);

  const peopleByTrip = new Map<string, PersonRef[]>();
  const personById = new Map(allPeople.map((p) => [p.id, p]));
  for (const tp of allTripPeople) {
    const person = personById.get(tp.personId);
    if (!person) continue;
    const list = peopleByTrip.get(tp.tripId) ?? [];
    list.push(person);
    peopleByTrip.set(tp.tripId, list);
  }

  const photosByTrip = new Map<string, PhotoPreview[]>();
  for (const p of allPhotos) {
    const list = photosByTrip.get(p.tripId) ?? [];
    list.push(p);
    photosByTrip.set(p.tripId, list);
  }

  const filtered = personId
    ? allTrips.filter((t) =>
        (peopleByTrip.get(t.id) ?? []).some((p) => p.id === personId),
      )
    : allTrips;

  const yearsMap = new Map<number, TimelineTrip[]>();
  for (const t of filtered) {
    const year = Number(t.startDate.slice(0, 4));
    const tripPhotos = photosByTrip.get(t.id) ?? [];
    const entry: TimelineTrip = {
      id: t.id,
      title: t.title,
      description: t.description,
      startDate: t.startDate,
      endDate: t.endDate,
      locationName: t.locationName,
      lat: t.lat,
      lng: t.lng,
      people: peopleByTrip.get(t.id) ?? [],
      photoCount: tripPhotos.length,
      previewPhotos: tripPhotos.slice(0, PREVIEW_COUNT),
      coverPhotoId: t.coverPhotoId ?? tripPhotos[0]?.id ?? null,
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

export async function getTripWithPhotos(tripId: string) {
  const db = getDb();
  const trip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
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

  return { trip, photos: tripPhotos, people: tripPersons };
}

export async function getAllPeople(): Promise<PersonRef[]> {
  return getDb()
    .select({ id: people.id, name: people.name })
    .from(people)
    .orderBy(asc(people.name));
}

// Server-only reads for the countries page. Each read returns only what the
// viewer may see: the columns and statuses come from the tier helpers in
// access-policy.ts, never from the tier name.
import "server-only";

import { and, asc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { members, people, personCountries, photos, tripPeople, trips } from "@/db/schema";
import { visibleTripIds } from "@/lib/access";
import {
  canEditCountries,
  countriesTier,
  tierColumns,
  tierStatuses,
  type CountriesTier,
  type Viewer,
} from "@/lib/access-policy";
import { countryKeyAt } from "@/lib/country-lookup";
import {
  pickSuggestions,
  samplePoints,
  visibleTaggedTripIds,
  type CountrySuggestion,
  type SuggestionPoint,
} from "@/lib/country-suggestions";
import type { CountryMark } from "@/lib/countries";

// Photos read per (trip, country name) for suggestions.
const SAMPLE_PER_GROUP = 3;

export type PersonTarget = { id: string; name: string; hasLogin: boolean };

export async function getPersonTarget(personId: string): Promise<PersonTarget | null> {
  const db = getDb();
  const [person] = await db
    .select({ id: people.id, name: people.name })
    .from(people)
    .where(eq(people.id, personId));
  if (!person) return null;
  const [login] = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.personId, personId))
    .limit(1);
  return { id: person.id, name: person.name, hasLogin: login !== undefined };
}

export async function getPersonCountries(
  viewer: Viewer,
  person: PersonTarget,
): Promise<{ tier: CountriesTier; marks: CountryMark[] }> {
  const tier = countriesTier(viewer, person);
  // note is part of the selected columns only when the tier may read it:
  // tierColumns alone decides which columns go into the select.
  const all = {
    countryKey: personCountries.countryKey,
    status: personCountries.status,
    year: personCountries.year,
    note: personCountries.note,
  };
  const columns = Object.fromEntries(tierColumns(tier).map((c) => [c, all[c]]));
  const rows = await getDb()
    .select(columns)
    .from(personCountries)
    .where(
      and(
        eq(personCountries.personId, person.id),
        inArray(personCountries.status, [...tierStatuses(tier)]),
      ),
    )
    .orderBy(asc(personCountries.countryKey));
  return { tier, marks: rows as CountryMark[] };
}

// The family-visible read: visited only, no viewer, no notes.
export async function getVisitedByPerson(
  personIds: readonly string[],
): Promise<Record<string, string[]>> {
  if (personIds.length === 0) return {};
  const out: Record<string, string[]> = {};
  for (const id of personIds) out[id] = [];
  const rows = await getDb()
    .select({ personId: personCountries.personId, countryKey: personCountries.countryKey })
    .from(personCountries)
    .where(
      and(
        inArray(personCountries.personId, [...personIds]),
        eq(personCountries.status, "visited"),
      ),
    )
    .orderBy(asc(personCountries.countryKey));
  for (const r of rows) out[r.personId]?.push(r.countryKey);
  return out;
}

export async function getCountrySuggestions(
  viewer: Viewer,
  person: PersonTarget,
): Promise<CountrySuggestion[]> {
  if (!canEditCountries(viewer, person.id)) return [];
  const db = getDb();

  const tagged = await db
    .select({ tripId: tripPeople.tripId })
    .from(tripPeople)
    .where(eq(tripPeople.personId, person.id));
  const visible = await visibleTripIds(viewer);
  const tripIds = visibleTaggedTripIds(
    tagged.map((r) => r.tripId),
    visible,
  );
  if (tripIds.length === 0) return [];

  // The SQL mirrors samplePoints (the tested definition of the rule): at most
  // SAMPLE_PER_GROUP photos per (trip, country name), earliest first, so the
  // rows read do not grow with the number of photos. samplePoints still runs
  // below and changes nothing when the SQL did its job.
  const ranked = db
    .select({
      tripId: photos.tripId,
      countryName: photos.country,
      lat: photos.lat,
      lng: photos.lng,
      takenAt: photos.takenAt,
      photoId: photos.id,
      rn: sql<number>`row_number() over (partition by ${photos.tripId}, ${photos.country} order by ${photos.takenAt}, ${photos.id})`.as(
        "rn",
      ),
    })
    .from(photos)
    .where(and(inArray(photos.tripId, tripIds), isNotNull(photos.lat), isNotNull(photos.lng)))
    .as("ranked");
  const rows = await db
    .select({
      tripId: trips.id,
      tripTitle: trips.title,
      startDate: trips.startDate,
      countryName: ranked.countryName,
      lat: ranked.lat,
      lng: ranked.lng,
    })
    .from(ranked)
    .innerJoin(trips, eq(ranked.tripId, trips.id))
    .where(lte(ranked.rn, SAMPLE_PER_GROUP))
    .orderBy(asc(trips.startDate), asc(ranked.takenAt), asc(ranked.photoId));

  const points: SuggestionPoint[] = rows.flatMap((r) =>
    r.lat === null || r.lng === null
      ? []
      : [
          {
            tripId: r.tripId,
            tripTitle: r.tripTitle,
            tripYear: Number(r.startDate.slice(0, 4)),
            countryName: r.countryName,
            lat: r.lat,
            lng: r.lng,
          },
        ],
  );
  const sampled = samplePoints(points, SAMPLE_PER_GROUP);
  const located = await Promise.all(
    sampled.map(async (point) => ({ point, countryKey: await countryKeyAt(point.lat, point.lng) })),
  );

  // Every status counts as existing, dismissed included, so a dismissed
  // country is never suggested again.
  const existingRows = await db
    .select({ countryKey: personCountries.countryKey })
    .from(personCountries)
    .where(eq(personCountries.personId, person.id));
  return pickSuggestions(located, new Set(existingRows.map((r) => r.countryKey)));
}

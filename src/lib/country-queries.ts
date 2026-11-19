// Server-only reads for the countries page. Each read returns only what the
// viewer may see: the columns and statuses come from the tier helpers in
// access-policy.ts, never from the tier name.
import "server-only";

import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";

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

  const rows = await db
    .select({
      tripId: trips.id,
      tripTitle: trips.title,
      startDate: trips.startDate,
      countryName: photos.country,
      lat: photos.lat,
      lng: photos.lng,
    })
    .from(photos)
    .innerJoin(trips, eq(photos.tripId, trips.id))
    .where(and(inArray(photos.tripId, tripIds), isNotNull(photos.lat), isNotNull(photos.lng)))
    .orderBy(asc(trips.startDate), asc(photos.takenAt), asc(photos.id));

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
  const sampled = samplePoints(points);
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

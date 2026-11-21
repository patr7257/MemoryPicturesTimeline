import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { getDb } from "@/db";
import { personCountries, photos, tripPeople, trips } from "@/db/schema";
import { rowKey, syncVacationCore, type LatLng, type VisitedStore } from "./auto-visited";
import { countryKeyAt } from "./country-lookup";

function drizzleStore(): VisitedStore {
  const db = getDb();
  return {
    async vacation(tripId) {
      const [trip] = await db
        .select({ startDate: trips.startDate, lat: trips.lat, lng: trips.lng })
        .from(trips)
        .where(eq(trips.id, tripId))
        .limit(1);
      if (!trip) return null;
      const people = await db
        .select({ personId: tripPeople.personId })
        .from(tripPeople)
        .where(eq(tripPeople.tripId, tripId));
      const gps = await db
        .select({ lat: photos.lat, lng: photos.lng })
        .from(photos)
        .where(and(eq(photos.tripId, tripId), isNotNull(photos.lat), isNotNull(photos.lng)));
      const points: LatLng[] = [];
      for (const p of gps) if (p.lat !== null && p.lng !== null) points.push({ lat: p.lat, lng: p.lng });
      // The vacation's own place counts too, so one without photos still yields its country.
      if (trip.lat !== null && trip.lng !== null) points.push({ lat: trip.lat, lng: trip.lng });
      return { startDate: trip.startDate, personIds: people.map((p) => p.personId), points };
    },
    async existingKeys(personIds) {
      if (personIds.length === 0) return new Set();
      const rows = await db
        .select({ personId: personCountries.personId, countryKey: personCountries.countryKey })
        .from(personCountries)
        .where(inArray(personCountries.personId, [...personIds]));
      return new Set(rows.map((r) => rowKey(r.personId, r.countryKey)));
    },
    async insertVisited(rows) {
      if (rows.length === 0) return 0;
      const written = await db
        .insert(personCountries)
        .values(rows.map((r) => ({ personId: r.personId, countryKey: r.countryKey, status: "visited", year: r.year, updatedBy: null })))
        .onConflictDoNothing()
        .returning({ personId: personCountries.personId });
      return written.length;
    },
  };
}

// Marks the countries found in a vacation's GPS photos and own place as visited
// for the people tagged on it. Existing rows (any status) are never changed.
// Never throws: it runs after the request it follows.
export async function syncVisitedForTrip(tripId: string): Promise<void> {
  try {
    await syncVacationCore(drizzleStore(), tripId, countryKeyAt);
  } catch (err) {
    console.error(`[auto-visited] failed for trip ${tripId}`, err instanceof Error ? err.name : "error");
  }
}

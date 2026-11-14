// Fills missing photo locations in one vacation from photos taken the same
// day (rule: src/lib/infer-location.mjs). Run after every upload, so it works
// whichever photo of a batch finishes first. Only rows still without a
// location are written, and they are flagged location_inferred.
import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { photos } from "@/db/schema";
import { inferLocations } from "@/lib/infer-location.mjs";

export async function fillTripLocations(tripId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({
      id: photos.id,
      tripId: photos.tripId,
      takenAt: photos.takenAt,
      lat: photos.lat,
      lng: photos.lng,
      city: photos.city,
      country: photos.country,
      locationInferred: photos.locationInferred,
    })
    .from(photos)
    .where(eq(photos.tripId, tripId));

  const fills = inferLocations(rows);
  for (const f of fills) {
    await db
      .update(photos)
      .set({ lat: f.lat, lng: f.lng, city: f.city, country: f.country, locationInferred: true })
      .where(and(eq(photos.id, f.id), isNull(photos.lat)));
  }
  return fills.length;
}

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { photos, trips } from "@/db/schema";
import { findVisibleTrip, getViewerOrNull } from "@/lib/access";
import { processOriginal } from "@/lib/images";
import { thumbKey } from "@/lib/keys";
import { getObjectBuffer, putObject, r2Configured } from "@/lib/r2";
import { fillTripLocations } from "@/lib/fill-locations";
import { reverseGeocode } from "@/lib/geocode";

// One photo per call; sharp on a large photo can take a while on a small box.
export const maxDuration = 60;

// Every refusal is logged: a rejected upload must leave a trace on the server.
function reject(status: number, error: string, context: Record<string, unknown>): Response {
  console.warn("[upload] finalize rejected", JSON.stringify({ status, error, ...context }));
  return Response.json({ error }, { status });
}

export async function POST(req: Request): Promise<Response> {
  const viewer = await getViewerOrNull();
  if (!viewer) return reject(401, "Unauthorized", {});
  const user = viewer.userId;
  if (!r2Configured()) {
    return reject(503, "Storage not configured", { user });
  }

  const body = (await req.json().catch(() => null)) as {
    photoId?: string;
    key?: string;
    tripId?: string;
    takenAt?: string | null;
    lat?: number | null;
    lng?: number | null;
  } | null;
  if (!body?.photoId || !body.key || !body.tripId) {
    return reject(400, "Bad request", { user });
  }
  const context = { user, trip: body.tripId, photo: body.photoId };
  if (!body.key.startsWith("originals/")) {
    return reject(400, "Bad key", context);
  }

  const db = getDb();

  // Uploading needs sight of the trip. Checked before the idempotent lookup so
  // a guessed key never returns a photo row from a trip the viewer cannot see.
  const trip = await findVisibleTrip(viewer, body.tripId);
  if (!trip) return reject(404, "Trip not found", context);

  // Idempotent: a retry after a half-completed finalize returns the row that
  // already exists (r2_key_original is UNIQUE).
  const existing = await db.query.photos.findFirst({
    where: eq(photos.r2KeyOriginal, body.key),
  });
  if (existing) {
    if (existing.tripId !== trip.id) {
      return reject(400, "Bad key", context);
    }
    return Response.json({ photo: existing, existed: true });
  }

  let original: Buffer;
  try {
    original = await getObjectBuffer(body.key);
  } catch {
    // The PUT to R2 never landed; the client must re-upload from presign.
    return reject(410, "Original not found in storage, upload again", context);
  }

  let processed: Awaited<ReturnType<typeof processOriginal>>;
  try {
    processed = await processOriginal(original);
    await Promise.all([
      putObject(thumbKey(body.photoId, 400), processed.thumb400, "image/webp"),
      putObject(thumbKey(body.photoId, 1200), processed.thumb1200, "image/webp"),
    ]);
  } catch (err) {
    console.error("[upload] finalize processing failed", JSON.stringify(context), err);
    return Response.json({ error: "Processing the photo failed. Press retry." }, { status: 500 });
  }

  const lat = typeof body.lat === "number" ? body.lat : null;
  const lng = typeof body.lng === "number" ? body.lng : null;
  const geo = lat !== null && lng !== null
    ? await reverseGeocode(lat, lng)
    : { city: null, country: null };

  const takenAt = body.takenAt ? new Date(body.takenAt) : null;
  const [row] = await db
    .insert(photos)
    .values({
      id: body.photoId,
      tripId: body.tripId,
      r2KeyOriginal: body.key,
      r2Key400: thumbKey(body.photoId, 400),
      r2Key1200: thumbKey(body.photoId, 1200),
      width: processed.width,
      height: processed.height,
      blurhash: processed.blurhash,
      takenAt: takenAt && !isNaN(takenAt.getTime()) ? takenAt : null,
      lat,
      lng,
      city: geo.city,
      country: geo.country,
      uploaderId: viewer.userId,
    })
    .onConflictDoNothing({ target: photos.r2KeyOriginal })
    .returning();

  // Give the trip a map pin from its first GPS-tagged photo.
  if (lat !== null && lng !== null) {
    await db
      .update(trips)
      .set({ lat, lng })
      .where(and(eq(trips.id, body.tripId), isNull(trips.lat)));
  }

  // Photos without GPS borrow the spot of a photo from the same day. Best
  // effort: a failure here never fails the upload.
  try {
    await fillTripLocations(body.tripId);
  } catch (err) {
    console.error("[upload] location fill failed for trip", body.tripId, err instanceof Error ? err.name : "error");
  }

  revalidatePath("/", "layout");
  return Response.json({ photo: row ?? null, existed: false });
}

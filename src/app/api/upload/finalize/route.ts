import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { photos, trips } from "@/db/schema";
import { getSession } from "@/lib/session";
import { processOriginal } from "@/lib/images";
import { thumbKey } from "@/lib/keys";
import { getObjectBuffer, putObject, r2Configured } from "@/lib/r2";
import { reverseGeocode } from "@/lib/geocode";

// One photo per call; sharp on a large photo can take a while on a small box.
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!r2Configured()) {
    return Response.json({ error: "Storage not configured" }, { status: 503 });
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
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  if (!body.key.startsWith("originals/")) {
    return Response.json({ error: "Bad key" }, { status: 400 });
  }

  const db = getDb();

  // Idempotent: a retry after a half-completed finalize returns the row that
  // already exists (r2_key_original is UNIQUE).
  const existing = await db.query.photos.findFirst({
    where: eq(photos.r2KeyOriginal, body.key),
  });
  if (existing) return Response.json({ photo: existing, existed: true });

  const trip = await db.query.trips.findFirst({
    where: eq(trips.id, body.tripId),
  });
  if (!trip) return Response.json({ error: "Trip not found" }, { status: 404 });

  let original: Buffer;
  try {
    original = await getObjectBuffer(body.key);
  } catch {
    // The PUT to R2 never landed; the client must re-upload from presign.
    return Response.json({ error: "Original not found in storage, upload again" }, { status: 410 });
  }

  const processed = await processOriginal(original);
  await Promise.all([
    putObject(thumbKey(body.photoId, 400), processed.thumb400, "image/webp"),
    putObject(thumbKey(body.photoId, 1200), processed.thumb1200, "image/webp"),
  ]);

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
      uploaderId: session.user.id,
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

  revalidatePath("/");
  return Response.json({ photo: row ?? null, existed: false });
}

import { and, count, eq, gte } from "drizzle-orm";

import { getDb } from "@/db";
import { photos, trips } from "@/db/schema";
import { photosAddedPayload } from "@/lib/push/copy";
import { broadcastPush } from "@/lib/push/send";
import { getSession } from "@/lib/session";

// Called ONCE by the upload page when a whole batch has finished (not per
// photo), so the family gets one push per batch per trip. The count is
// verified against the database: photos this user added to the trip in the
// last 6 hours, capped by what the client claims.
export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as {
    tripId?: unknown;
    count?: unknown;
  } | null;
  if (typeof body?.tripId !== "string" || !Number.isInteger(body.count) || (body.count as number) < 1) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const claimed = Math.min(body.count as number, 1000);

  const db = getDb();
  const trip = await db.query.trips.findFirst({ where: eq(trips.id, body.tripId) });
  if (!trip) return Response.json({ error: "Trip not found" }, { status: 404 });

  const since = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const [row] = await db
    .select({ n: count() })
    .from(photos)
    .where(
      and(
        eq(photos.tripId, trip.id),
        eq(photos.uploaderId, session.user.id),
        gte(photos.createdAt, since),
      ),
    );
  const verified = Math.min(claimed, row?.n ?? 0);
  if (verified < 1) return Response.json({ sent: 0 });

  const sent = await broadcastPush(
    "photos_added",
    photosAddedPayload({
      uploaderName: session.user.name,
      count: verified,
      tripId: trip.id,
      tripTitle: trip.title,
    }),
    { excludeUserId: session.user.id },
  );
  return Response.json({ sent });
}

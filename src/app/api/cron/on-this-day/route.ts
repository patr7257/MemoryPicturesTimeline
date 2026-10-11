import { timingSafeEqual } from "node:crypto";

import { getDb } from "@/db";
import { pushDispatchLog, trips } from "@/db/schema";
import { onThisDayPayload } from "@/lib/push/copy";
import { copenhagenDay, dayKey, tripsOnThisDay } from "@/lib/push/on-this-day";
import { broadcastPush, pushEnabled } from "@/lib/push/send";

// Daily trigger, called by an external scheduler:
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://memories.patrickrobel.dk/api/cron/on-this-day
// Idempotent per Copenhagen calendar day via push_dispatch_log.

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request): Promise<Response> {
  if (!process.env.CRON_SECRET) {
    return Response.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Dev shares the prod database: with sending off, do nothing and, above all,
  // do not burn today's idempotency slot.
  if (!pushEnabled()) return Response.json({ skipped: "push disabled" });

  const today = copenhagenDay(new Date());
  const key = dayKey(today);
  const db = getDb();

  const matches = tripsOnThisDay(
    await db.select({ id: trips.id, title: trips.title, startDate: trips.startDate }).from(trips),
    today,
  );
  const payload = onThisDayPayload(matches, key);
  if (!payload) return Response.json({ day: key, trips: 0, sent: 0 });

  // Claim the day first: the primary key makes a concurrent or repeated call a no-op.
  const claimed = await db
    .insert(pushDispatchLog)
    .values({ key: `on_this_day:${key}` })
    .onConflictDoNothing()
    .returning({ key: pushDispatchLog.key });
  if (claimed.length === 0) return Response.json({ day: key, skipped: "already sent" });

  const sent = await broadcastPush("on_this_day", payload);
  return Response.json({ day: key, trips: matches.length, sent });
}

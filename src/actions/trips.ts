"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { tripPeople, trips, tripShares } from "@/db/schema";
import { findVisibleTrip, getViewer, tripAudienceUserIds } from "@/lib/access";
import { validateLatLng } from "@/lib/photo-location";
import { AccessError, canManageTrip, type Viewer } from "@/lib/access-policy";
import { fail, type ActionResult } from "@/lib/action-result";
import { syncVisitedForTrip } from "@/lib/auto-visited-sync";
import { getPersonFacts } from "@/lib/family-queries";
import { tripCreatedPayload } from "@/lib/push/copy";
import { broadcastPush } from "@/lib/push/send";
import { TRIP_NOT_FOUND, cleanIdList, decideShares, decideTags } from "@/lib/share-rules";

const GENERIC = "Something went wrong. Try again.";

// Marks the countries of a vacation as visited for its tagged people, after
// the response. syncVisitedForTrip never throws, so it cannot fail the action.
const scheduleVisitedSync = (tripId: string) => after(() => syncVisitedForTrip(tripId));

async function tagsOf(tripId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ personId: tripPeople.personId })
    .from(tripPeople)
    .where(eq(tripPeople.tripId, tripId));
  return rows.map((r) => r.personId);
}

// The trip when the viewer may manage it (creator or super admin). A trip the
// viewer cannot even see reads as missing.
async function requireManagedTrip(viewer: Viewer, tripId: string) {
  const trip = await findVisibleTrip(viewer, tripId);
  if (!trip) throw new AccessError("Trip not found");
  if (!canManageTrip(viewer, trip)) {
    throw new AccessError("Only the creator or a super admin can change this trip");
  }
  return trip;
}

export type CreateTripInput = {
  title: string;
  startDate: string; // yyyy-mm-dd
  endDate?: string | null;
  locationName?: string | null;
  description?: string | null;
  // People tagged at creation: they (and only they, plus the creator and
  // super admins) will see the trip.
  personIds?: string[];
};

export async function createTrip(input: CreateTripInput): Promise<ActionResult<{ id: string }>> {
  const viewer = await getViewer();
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  if (!title) return fail("Title is required");
  if (typeof input.startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
    return fail("Start date is required");
  }

  let id: string;
  let personIds: string[];
  try {
    // Every tag is new here: each must be someone the viewer may tag. A
    // refusal writes nothing.
    const requested = input.personIds ?? [];
    const facts = await getPersonFacts(cleanIdList(requested) ?? []);
    const tags = decideTags(viewer, { current: [], next: requested, facts });
    if (!tags.ok) return fail(tags.error);
    personIds = tags.next;

    id = await getDb().transaction(async (tx) => {
      const [row] = await tx
        .insert(trips)
        .values({
          title,
          startDate: input.startDate,
          endDate: input.endDate || null,
          locationName: input.locationName?.trim() || null,
          description: input.description?.trim() || null,
          createdBy: viewer.userId,
        })
        .returning({ id: trips.id });
      if (personIds.length > 0) {
        await tx
          .insert(tripPeople)
          .values(personIds.map((personId) => ({ tripId: row.id, personId })))
          .onConflictDoNothing();
      }
      return row.id;
    });
  } catch (err) {
    console.error("[trips] create failed", err instanceof Error ? err.name : "error");
    return fail(GENERIC);
  }

  if (personIds.length > 0) scheduleVisitedSync(id);

  // Push after the response; a failing push must never fail the create.
  after(async () => {
    try {
      await broadcastPush(
        "trip_created",
        tripCreatedPayload({ tripId: id, tripTitle: title }),
        { excludeUserId: viewer.userId, onlyUserIds: await tripAudienceUserIds(id) },
      );
    } catch (err) {
      console.error("[push] trip_created failed", err instanceof Error ? err.message : err);
    }
  });

  revalidatePath("/", "layout");
  return { ok: true, id };
}

export type UpdateTripInput = {
  id: string;
  title?: string;
  startDate?: string;
  endDate?: string | null;
  locationName?: string | null;
  description?: string | null;
  lat?: number | null;
  lng?: number | null;
  coverPhotoId?: string | null;
};

export async function updateTrip(input: UpdateTripInput): Promise<void> {
  await requireManagedTrip(await getViewer(), input.id);
  const db = getDb();
  const patch: Partial<typeof trips.$inferInsert> = {};
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) throw new Error("Title cannot be empty");
    patch.title = t;
  }
  if (input.startDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) throw new Error("Bad start date");
    patch.startDate = input.startDate;
  }
  if (input.endDate !== undefined) patch.endDate = input.endDate || null;
  if (input.locationName !== undefined) patch.locationName = input.locationName?.trim() || null;
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.lat !== undefined || input.lng !== undefined) {
    // Both together: a real spot, or both null to clear the place.
    if (input.lat === null && input.lng === null) {
      patch.lat = null;
      patch.lng = null;
    } else {
      const spot = validateLatLng(input.lat, input.lng);
      if (!spot.ok) throw new Error("Bad location");
      patch.lat = spot.value.lat;
      patch.lng = spot.value.lng;
    }
  }
  if (input.coverPhotoId !== undefined) patch.coverPhotoId = input.coverPhotoId;
  if (Object.keys(patch).length === 0) return;

  await db.update(trips).set(patch).where(eq(trips.id, input.id));
  // The vacation's own place counts for auto-visited.
  if (patch.lat !== undefined || patch.lng !== undefined) scheduleVisitedSync(input.id);
  revalidatePath("/", "layout");
}

// Replaces the tags. Tags belong to the creator and super admins: they may
// remove any tag, keep the ones already there, and add only people they may tag.
export async function setTripPeople(tripId: string, personIds: string[]): Promise<ActionResult> {
  const viewer = await getViewer();
  try {
    const trip = await findVisibleTrip(viewer, tripId);
    if (!trip) return fail(TRIP_NOT_FOUND);
    if (!canManageTrip(viewer, trip)) {
      return fail("Only the creator or a super admin can change who was on this vacation.");
    }
    const current = await tagsOf(tripId);
    const facts = await getPersonFacts(cleanIdList(personIds) ?? []);
    const tags = decideTags(viewer, { current, next: personIds, facts });
    if (!tags.ok) return fail(tags.error);
    const next = tags.next;
    await getDb().transaction(async (tx) => {
      await tx.delete(tripPeople).where(eq(tripPeople.tripId, tripId));
      if (next.length > 0) {
        await tx
          .insert(tripPeople)
          .values(next.map((personId) => ({ tripId, personId })))
          .onConflictDoNothing();
      }
    });
  } catch (err) {
    console.error("[trips] set people failed", err instanceof Error ? err.name : "error");
    return fail(GENERIC);
  }
  scheduleVisitedSync(tripId);
  revalidatePath("/", "layout");
  return { ok: true };
}

// Replaces the vacation's shares with the ticked people, limited to those the
// saver may pick. Shares the saver could not have made are left alone and
// never mentioned. Sharing sends no push.
export async function setTripShares(tripId: string, personIds: string[]): Promise<ActionResult> {
  const viewer = await getViewer();
  try {
    // 1. Visible, else the generic refusal, before anything else is read.
    const trip = await findVisibleTrip(viewer, tripId);
    if (!trip) return fail(TRIP_NOT_FOUND);
    const db = getDb();
    const [tagged, shareRows] = await Promise.all([
      tagsOf(tripId),
      db.select({ personId: tripShares.personId }).from(tripShares).where(eq(tripShares.tripId, tripId)),
    ]);
    const current = shareRows.map((r) => r.personId);
    const facts = await getPersonFacts([...(cleanIdList(personIds) ?? []), ...current]);
    // 2. canShareTrip, then 3. planShareChange, in that order (share-rules.ts).
    const plan = decideShares(viewer, {
      trip: { createdBy: trip.createdBy, personIds: tagged },
      current,
      ticked: personIds,
      facts,
    });
    if (!plan.ok) return fail(plan.error);
    // 4. Both changes in one transaction.
    if (plan.add.length > 0 || plan.remove.length > 0) {
      await db.transaction(async (tx) => {
        if (plan.add.length > 0) {
          await tx
            .insert(tripShares)
            .values(plan.add.map((personId) => ({ tripId, personId, sharedBy: viewer.userId })))
            .onConflictDoNothing();
        }
        if (plan.remove.length > 0) {
          await tx
            .delete(tripShares)
            .where(and(eq(tripShares.tripId, tripId), inArray(tripShares.personId, plan.remove)));
        }
      });
    }
  } catch (err) {
    console.error("[trips] set shares failed", err instanceof Error ? err.name : "error");
    return fail(GENERIC);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteTrip(tripId: string): Promise<void> {
  await requireManagedTrip(await getViewer(), tripId);
  // Photo rows cascade; R2 objects become orphans (cheap, swept later).
  await getDb().delete(trips).where(eq(trips.id, tripId));
  revalidatePath("/", "layout");
}
